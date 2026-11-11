#!/usr/bin/env bash
# Unpacks the latest @puntjes/sdk release from npm into the folder given as $1, so bc-check can compare against it.
set -euo pipefail

folder="${1:?Usage: unpack-last-release.sh <folder>}"
version=$(npm view @puntjes/sdk dist-tags.latest)

mkdir -p "$folder"
npm pack "@puntjes/sdk@$version" --pack-destination "$folder" --loglevel=error > /dev/null
tar -xzf "$folder"/puntjes-sdk-*.tgz -C "$folder" --strip-components=1
echo "Unpacked @puntjes/sdk@$version into $folder"
