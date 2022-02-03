FROM node:17-bullseye

# Applying fs patch for assets
ADD rootfs.tar.gz /

RUN apt-get update \
 && apt-get install \
        --no-install-recommends \
        --fix-missing \
        --assume-yes \
            vim \
        && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

ENTRYPOINT ["node", "/opt/icloud-photos-sync/dist/index.js"]