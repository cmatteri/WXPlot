#!/usr/bin/env bash
set -o nounset
set -o errexit
set -o pipefail
shopt -s failglob

cd "$(dirname "$0")"
trap 'kill $(jobs -p)' EXIT
node_modules/.bin/live-reload css/ test/ dev/ --port=4000 &
node_modules/.bin/nodemon -w src -x "npm" -- run build-dev &
node app.js