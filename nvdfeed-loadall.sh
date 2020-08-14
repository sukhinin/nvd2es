#!/usr/bin/env bash

set -eo pipefail

for feed in $(seq 2002 $(date +'%Y')) modified; do
  NVD_FEED=$feed ./nvdfeed-update.sh
done
