!/bin/bash

# Please refer to the following URL for further details re multi-architecture docker builds:
#       https://billglover.me/2018/10/30/multi-architecture-docker-builds/

# Build with:

docker build --no-cache -t kordonskim/sys-monitor-api:arm32v6 -f Dockerfile-arm32v6 .
docker build --no-cache -t kordonskim/sys-monitor-api:arm64v8 -f Dockerfile-arm64v8 .
docker build --no-cache -t kordonskim/sys-monitor-api:amd64 -f Dockerfile-amd64 .

# Push with:

docker push kordonskim/sys-monitor-api:arm32v6
docker push kordonskim/sys-monitor-api:arm64v8
docker push kordonskim/sys-monitor-api:amd64

# Setup multi-architecture docker..
docker manifest create --amend kordonskim/sys-monitor-api kordonskim/sys-monitor-api:arm32v6 kordonskim/sys-monitor-api:arm64v8 kordonskim/sys-monitor-api:amd64

docker manifest push kordonskim/sys-monitor-api:latest



