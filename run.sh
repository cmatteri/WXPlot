#!/usr/bin/env bash
set -o nounset
set -o errexit
set -o pipefail
shopt -s failglob

# Terminates all jobs (in the current shell). Initially sends SIGTERM. If
# jobs don't exit SIGKILL is used. 
cleanup() {
    # '|| true' is used to prevent Bash from exiting if errexit is set
    local jobs=$(jobs -p)
    local -i start=$(date +%s)
    while [[ -n $jobs ]]; do
        if (( $(date +%s) - start > 2 )); then
            kill -9 $jobs 2>/dev/null || true
        else
            kill $jobs 2>/dev/null || true
        fi

        # If all jobs have terminated, exit here.
        if [[ -z $(jobs -p) ]]; then
            break;
        fi

        # Otherwise, we want to pause for 1 second, but also respond
        # immediately if a job terminates. Thus we run sleep in the background
        # and wait for it or the jobs to terminate.
        sleep 1 &
        wait -n || true

        # If the sleep process is still around, disown it so it doesn't show up
        # in the list of jobs.
        disown $! 2>/dev/null || true
        jobs=$(jobs -p)
    done
}

main() {
    local weewx_bin="${1-}"
    local weewx_conf="${2-}"

    if [[ $# -ne 2 || ! -x $weewx_bin || ! -f $weewx_conf ]]; then
        echo "Usage: run.sh <weewx-bin> <weewx-conf>"
        exit 1
    fi

    cd "$(dirname "$0")"

    trap cleanup EXIT
    PYTHONPATH="$weewx_bin" wxplotflask/main.py "$weewx_conf" &
    cd wxplotjs
    sass --watch scss:public &

    # Exit if any of the background jobs return
    wait -n $(jobs -p)
}

main "$@"