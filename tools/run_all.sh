#!/bin/bash
# Run every check for santa-visit.
#
#   bash tools/run_all.sh
#
# The privacy guard is in here on purpose. It is the control that makes the
# product's central claim true rather than aspirational, so it must run with
# everything else — a guard nobody executes is a comment, not a control.
set -u
cd "$(dirname "$0")/.."
rc=0

echo "=============================================================="
echo " 1  zero-upload guard"
echo "=============================================================="
python3 tools/check_privacy.py || rc=1

echo
echo "=============================================================="
echo " 2  file integrity"
echo "=============================================================="
python3 tools/check_integrity.py || rc=1

echo
echo "=============================================================="
echo " 3  art intake (photoreal Santa, if delivered)"
echo "=============================================================="
python3 tools/check_art.py || rc=1

echo
echo "=============================================================="
echo " 4  requirements coverage"
echo "=============================================================="
python3 tools/check_requirements.py || rc=1

echo
if [ "$rc" -eq 0 ]; then echo "SUITE: PASS"; else echo "SUITE: FAIL"; fi
exit $rc
