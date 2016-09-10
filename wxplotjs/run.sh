#!/usr/bin/env bash
set -o nounset
set -o errexit
set -o pipefail
shopt -s failglob

cd "$(dirname "$0")"
trap 'kill $(jobs -p)' EXIT
# Delay is in ms and doesn't like being 0, so use 1.
node_modules/.bin/live-reload css/ test/ dev/ --port=4000 --delay=1 &
node_modules/.bin/nodemon -w src -x "npm" -- run build-dev &
node app.js