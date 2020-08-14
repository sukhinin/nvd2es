#!/usr/bin/env bash

# WARNING! THE SCRIPT PASSES CREDENTIALS VIA COMMAND LINE. SHOULD YOUR ENVIRONMENT
# LOG COMMAND LINE CALLS, PLEASE ENSURE SENSITIVE INFORMATION IS MASKED OUT.

set -eo pipefail

ES_HOST=${ES_HOST:-http://localhost:9200}

# Variables have to be exported to allow envsubst to pick them up.
export ES_INDEX=${ES_INDEX:-nvdfeed}
export ES_INDEX_SHARDS=${ES_INDEX_SHARDS:-3}
export ES_INDEX_REPLICAS=${ES_INDEX_REPLICAS:-1}

curl_opts=('-sL' '-XPUT' '-H' 'Content-Type: application/json' '-w' '\n%{http_code}')
if [[ ! -z "$ES_USERNAME" ]]; then
  curl_opts+=("-u" "$ES_USERNAME:$ES_PASSWORD")
fi

es_index_template_file=$(mktemp)
trap "rm -f $es_index_template_file" EXIT
cat es/index-template.json | envsubst >$es_index_template_file

echo -n "Creating index template '$ES_INDEX' ... "
es_index_template_url="$ES_HOST/_template/$ES_INDEX?pretty"
es_index_template_output=$(curl "${curl_opts[@]}" --data-binary "@$es_index_template_file" "$es_index_template_url")
es_index_template_status=$(echo "$es_index_template_output" | tail -1)
if [[ "$es_index_template_status" -lt 200 || "$es_index_template_status" -gt 299 ]]; then
  echo "FAILED"
  echo "$es_index_template_output" | sed '$d'
  exit 1
fi
echo "OK"

es_index_bootstrap_file=$(mktemp)
trap "rm -f $es_index_bootstrap_file" EXIT
cat es/index-bootstrap.json | envsubst >$es_index_bootstrap_file

echo -n "Bootstrapping index '$ES_INDEX-000001' ... "
es_index_bootstrap_url="$ES_HOST/$ES_INDEX-000001?pretty"
es_index_bootstrap_output=$(curl "${curl_opts[@]}" --data-binary "@$es_index_bootstrap_file" "$es_index_bootstrap_url")
es_index_bootstrap_status=$(echo "$es_index_bootstrap_output" | tail -1)
if [[ "$es_index_bootstrap_status" -lt 200 || "$es_index_bootstrap_status" -gt 299 ]]; then
  echo "FAILED"
  echo "$es_index_bootstrap_output" | sed '$d'
  exit 1
fi
echo "OK"
