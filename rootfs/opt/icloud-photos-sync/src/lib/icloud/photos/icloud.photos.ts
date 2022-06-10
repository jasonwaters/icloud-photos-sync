import axios, {AxiosRequestConfig, AxiosResponse} from 'axios';
import log from 'loglevel';
import {EventEmitter} from 'events';

import * as ICLOUD_PHOTOS from './icloud.photos.constants.js';
import {iCloudAuth} from '../icloud.auth.js';

/**
 * This class holds connection and state with the iCloud Photos Backend and provides functions to access the data stored there
 */
export class iCloudPhotos extends EventEmitter {
    /**
     * Cookie required to authenticate against the iCloud Services
     */
    auth: iCloudAuth;

    logger: log.Logger = log.getLogger(`I-Cloud-Photos`);

    constructor(auth: iCloudAuth) {
        super();
        this.auth = auth;

        this.on(ICLOUD_PHOTOS.EVENTS.SETUP_COMPLETE, this.checkingIndexingStatus);

        // This.on(ICLOUD_PHOTOS.EVENTS.READY, () => {

        // });

        // this.on(ICLOUD_PHOTOS.EVENTS.INDEX_IN_PROGRESS, (progress: string) => {
        // @todo: Implement retry instead of failure
        // });

        // this.on(ICLOUD_PHOTOS.EVENTS.ERROR, (msg: string) => {

        // });
    }

    /**
     * Builds the full service endpoint URL based on currently assigned iCP domain
     * @param ext - The service endpoint extension applied to the base domain
     */
    getServiceEndpoint(ext: string): string {
        return `${this.auth.iCloudPhotosAccount.photosDomain}${ICLOUD_PHOTOS.PATHS.BASE_PATH}${ext}`;
    }

    /**
     * Starting iCloud Photos service, acquiring all necessary account information stored in iCloudAuth.iCloudPhotosAccount
     */
    setup() {
        this.logger.debug(`Getting iCloud Photos account information`);

        const config: AxiosRequestConfig = {
            headers: this.auth.getPhotosHeader(),
            params: {
                getCurrentSyncToken: `True`,
                remapEnums: `True`,
            },
        };

        axios.get(this.getServiceEndpoint(ICLOUD_PHOTOS.PATHS.EXT.LIST), config)
            .then(res => {
                if (this.auth.processPhotosSetupResponse(res)) {
                    this.logger.debug(`Successfully gathered iCloud Photos account information!`);
                    this.emit(ICLOUD_PHOTOS.EVENTS.SETUP_COMPLETE);
                } else {
                    this.emit(ICLOUD_PHOTOS.EVENTS.ERROR, `Unable to acquire iCloud Photos account information`);
                }
            })
            .catch(err => {
                this.emit(ICLOUD_PHOTOS.EVENTS.ERROR, `Unexpected error while setup: ${err}`);
            });
    }

    /**
     * Checking indexing state of photos service (sync should only safely be performed, after indexing is completed)
     */
    checkingIndexingStatus() {
        this.logger.debug(`Checking Indexing Status of iCloud Photos Account`);
        this.performQuery(`CheckIndexingState`, res => {
            const state = res.data.records[0].fields.state.value;
            if (!state) {
                this.emit(ICLOUD_PHOTOS.EVENTS.ERROR, `Unable to get indexing state: ${res.data}`);
            } else if (state === `FINISHED`) {
                this.logger.info(`Indexing finished, sync can start!`);
                this.emit(ICLOUD_PHOTOS.EVENTS.READY);
            } else {
                const progress = res.data.records[0].fields.progress.value;
                if (progress) {
                    this.emit(ICLOUD_PHOTOS.EVENTS.INDEX_IN_PROGRESS, progress);
                } else {
                    this.emit(ICLOUD_PHOTOS.EVENTS.ERROR, `Unknown state (${state}): ${res.data}`);
                }
            }
        });
    }

    /**
     * Performs an arbitrary iCloud Photos Query
     * @param recordType - The recordType requested in the query
     * @param callback - A callback, executed upon sucessfull execution of the query
     */
    performQuery(recordType: string, callback: (res: AxiosResponse<any, any>) => void) {
        if (this.auth.validatePhotosAccount()) {
            const config: AxiosRequestConfig = {
                headers: this.auth.getPhotosHeader(),
            };

            const data = {
                query: {
                    recordType: `${recordType}`,
                },
                zoneID: {
                    ownerRecordName: this.auth.iCloudPhotosAccount.ownerName,
                    zoneName: this.auth.iCloudPhotosAccount.zoneName,
                    zoneType: this.auth.iCloudPhotosAccount.zoneType,
                },
            };

            axios.post(this.getServiceEndpoint(ICLOUD_PHOTOS.PATHS.EXT.QUERY), data, config)
                .then(callback)
                .catch(err => {
                    this.emit(ICLOUD_PHOTOS.EVENTS.ERROR, `Unexpected error when performing query ${recordType}: ${err}`);
                });
        } else {
            this.emit(ICLOUD_PHOTOS.EVENTS.ERROR, `Unable to perform query, because photos account validation failed`);
        }
    }

    async performPromiseQuery(recordType: string, filterBy?: [any]): Promise<AxiosResponse<any, any>> {
        if (this.auth.validatePhotosAccount()) {
            const config: AxiosRequestConfig = {
                headers: this.auth.getPhotosHeader(),
            };

            const data = {
                query: {
                    recordType: `${recordType}`,
                    filterBy,
                },
                zoneID: {
                    ownerRecordName: this.auth.iCloudPhotosAccount.ownerName,
                    zoneName: this.auth.iCloudPhotosAccount.zoneName,
                    zoneType: this.auth.iCloudPhotosAccount.zoneType,
                },
            };

            return axios.post(this.getServiceEndpoint(ICLOUD_PHOTOS.PATHS.EXT.QUERY), data, config);
        }

        throw (new Error(`Unable to perform query, because photos account validation failed`));
    }

    async queryAllAlbums(): Promise<AxiosResponse<any, any>> {
        return this.performPromiseQuery(`CPLAlbumByPositionLive`);
    }

    async queryAllAlbumsByParentId(parentId: string): Promise<AxiosResponse<any, any>> {
        const parentFilter = {
            comparator: `EQUALS`,
            fieldName: `parentId`,
            fieldValue: {
                type: `STRING`,
                value: parentId,
            },
        };
        return this.performPromiseQuery(`CPLAlbumByPositionLive`, [parentFilter]);
    }
}