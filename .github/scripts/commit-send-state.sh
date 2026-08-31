#!/usr/bin/env bash
# Commit and push this run's send state (dedup markers, archive, diagnostics).
#
# INVARIANT: exit 0  <=> the send-state is content-identical on origin/main.
#            exit 1  <=> it is NOT recorded remotely — the job MUST go red,
#            because the email has already been delivered and unrecorded state
#            means every later trigger re-sends (duplicate newsletters).
#
# Replaces the old retry loop, which had two defects (2026-08-31 audit):
#   1. `git rebase --strategy-option=ours` — in a rebase git swaps sides, so
#      "ours" is ORIGIN, not our commit: a conflict silently discarded the
#      just-written sent-articles.json and pushed green without it.
#   2. The loop ended `|| true` with no push after the final rebase, so three
#      failed pushes still exited 0 — job green, state lost.
# Strategy here: no rebase at all. Snapshot this run's output files, and on
# push rejection rebuild the commit from scratch on the new origin tip
# (fetch → reset --hard → restore snapshot → re-commit). The run's state
# files always win for the paths below; that is intentional — sent-articles
# is only ever written by the send (serialized by the concurrency group), and
# a racing build's feed.json is superseded minutes later by the next build.
# Known minor trade-off: archive-retention DELETIONS are not re-applied on
# the rebuild path (resurrected files are re-pruned by the next send).
set -u

STATE_FILES=(docs/sent-articles.json docs/feed.json docs/included-articles.json
             docs/quality-scores.json docs/quality-scores.csv docs/daily-logic-impact.csv)
STATE_DIRS=(docs/diagnostics docs/newsletter-archive)
MSG="${1:-📧 Newsletter sent - $(date -u +'%Y-%m-%d %H:%M UTC')}"
ATTEMPTS="${COMMIT_SEND_STATE_ATTEMPTS:-5}"

stage() {
    # Same staging semantics as the pre-2026-08-31 workflow step. Per-path so a
    # missing file (e.g. a run that wrote no CSV) can't abort staging the rest.
    for f in "${STATE_FILES[@]}"; do [ -e "$f" ] && git add "$f"; done
    for d in "${STATE_DIRS[@]}"; do [ -d "$d" ] && git add -A "$d"; done
    return 0
}

# Snapshot the run's outputs BEFORE any git surgery so they can be re-applied
# on top of whatever origin/main has moved to.
SNAP="$(mktemp -d)"
trap 'rm -rf "$SNAP"' EXIT
EXISTING=()
for p in "${STATE_FILES[@]}" "${STATE_DIRS[@]}"; do
    [ -e "$p" ] && EXISTING+=("$p")
done
tar -cf "$SNAP/state.tar" "${EXISTING[@]}"

stage
if git diff --staged --quiet; then
    echo "No changes to send state"
    exit 0
fi
git commit -m "$MSG"

for i in $(seq 1 "$ATTEMPTS"); do
    if git push; then
        echo "✅ Send-state push OK (attempt $i)"
        exit 0
    fi
    echo "Push rejected (attempt $i/$ATTEMPTS) — rebuilding commit on fresh origin/main"
    git fetch origin main
    git reset --hard origin/main
    tar -xf "$SNAP/state.tar"
    stage
    if git diff --staged --quiet; then
        # Origin already has content-identical state (e.g. an earlier push
        # landed but the response was lost). The invariant holds.
        echo "✅ Send state already on origin/main"
        exit 0
    fi
    git commit -m "$MSG"
done

echo "::error::Send-state commit FAILED to reach origin/main after $ATTEMPTS attempts. The email was already delivered but is NOT recorded — later triggers may DUPLICATE-SEND. Investigate immediately."
exit 1
