#!/usr/bin/env sh
# cd into the directory containing this script
cd "$(dirname "$0")"
# These should point to your weewx installations bin directory and weewx.conf.
WEEWX_BIN="/Users/chris/git/weewx-3.5.0/bin/"
WEEWX_CONF="/Users/chris/git/weewx-3.5.0/weewx.conf"
PYTHONPATH="$WEEWX_BIN" ./main.py "$WEEWX_CONF"
