#!/usr/bin/env bash

# WARNING! THE SCRIPT PASSES CREDENTIALS VIA COMMAND LINE. SHOULD YOUR ENVIRONMENT
# LOG COMMAND LINE CALLS, PLEASE ENSURE SENSITIVE INFORMATION IS MASKED OUT.

set -eo pipefail

NVD_FEED=${NVD_FEED:-modified}
ES_HOST=${ES_HOST:-http://localhost:9200}
ES_INDEX=${ES_INDEX:-nvdfeed}

nvd_original_feed_file=$(mktemp)
trap "rm -f $nvd_original_feed_file" EXIT

nvd_mapped_feed_file=$(mktemp)
trap "rm -f $nvd_mapped_feed_file" EXIT

echo -n "Downloading NVD feed '$NVD_FEED' ... "
nvd_feed_fetch_url="https://nvd.nist.gov/feeds/json/cve/1.1/nvdcve-1.1-$NVD_FEED.json.gz"
curl -sL "$nvd_feed_fetch_url" | gunzip >$nvd_original_feed_file || {
  echo "FAILED, code $?"
  exit 1
}
echo "OK"

echo -n "Converting feed data ... "
node nvdfeed-map.js "$nvd_original_feed_file" "$nvd_mapped_feed_file"
echo "OK"

curl_opts=('-sL' '-XPOST' '-H' 'Content-Type: application/x-ndjson')
if [[ ! -z "$ES_USERNAME" ]]; then
  curl_opts+=("-u" "$ES_USERNAME:$ES_PASSWORD")
fi

echo -n "Loading feed '$NVD_FEED' into index '$ES_INDEX' ... "
es_bulk_index_url="$ES_HOST/$ES_INDEX/_bulk?pretty"
es_bulk_index_output=$(curl "${curl_opts[@]}" --data-binary "@$nvd_mapped_feed_file" "$es_bulk_index_url") || {
  echo "FAILED, code $?"
  exit 1
}
es_bulk_index_error=$(jq '.error' <<<"$es_bulk_index_output")
if [[ "$es_bulk_index_error" != "null" ]]; then
  error_reason=$(jq '.reason? // . // "unknown error"' <<<"$es_bulk_index_error" | sed -e 's/^"//' -e 's/"$//')
  echo "FAILED, $error_reason"
  exit 1
fi
echo "OK"
