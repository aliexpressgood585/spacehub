#!/usr/bin/env bash
# v85.4 gym: 15m bars for the pinned 40, capped at 36 months (see fetch-1h.sh — same script, BT_IV=15m).
BT_IV=15m exec bash "$(dirname "$0")/fetch-1h.sh"
