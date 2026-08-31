#!/usr/bin/env bash
# Sandbox tests for commit-send-state.sh (2026-08-31 production-safety patch).
# Builds throwaway git repos (bare origin + clones) and verifies the invariant:
#   exit 0  <=> this run's sent-state is content-identical on origin/main
#   exit 1  <=> it is not (job must go red)
# Also REPRODUCES the two defects of the old retry loop (audit findings 1-2) so
# the failure scenarios are demonstrated, not just described.
#
# Run:  bash .github/scripts/commit-send-state.test.sh
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/commit-send-state.sh"
PASS=0; FAIL=0
ok()   { echo "✓ $1"; PASS=$((PASS+1)); }
bad()  { echo "✗ $1"; FAIL=$((FAIL+1)); }
check(){ if [ "$2" -eq 0 ]; then ok "$1"; else bad "$1"; fi; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
TODAY="$(date -u +%Y-%m-%d)"

git_id() { git -C "$1" config user.email "test@example.com"; git -C "$1" config user.name "test"; }

make_world() { # $1 = world dir. Creates origin.git + cloneA (send run) + cloneB (racer)
    local w="$1"
    mkdir -p "$w"
    git init --bare -q "$w/origin.git"
    git -C "$w/origin.git" symbolic-ref HEAD refs/heads/main
    git clone -q "$w/origin.git" "$w/seed"
    git_id "$w/seed"
    git -C "$w/seed" checkout -qb main 2>/dev/null || git -C "$w/seed" checkout -q main
    mkdir -p "$w/seed/docs/diagnostics" "$w/seed/docs/newsletter-archive"
    printf '{\n  "sent": [\n    { "id": "entry-A", "sentAt": "2026-08-01" }\n  ]\n}\n' > "$w/seed/docs/sent-articles.json"
    echo '{"items":[]}' > "$w/seed/docs/feed.json"
    echo '{}' > "$w/seed/docs/included-articles.json"
    printf '{\n  "updatedAt": "2026-08-01T00:00:00Z",\n  "history": [\n    { "date": "2026-08-01", "runId": "2026-08-01-1100", "score": 70 }\n  ]\n}\n' > "$w/seed/docs/quality-scores.json"
    printf 'date,runId,score\n2026-08-01,2026-08-01-1100,70\n' > "$w/seed/docs/quality-scores.csv"
    printf 'date,run_id,articles_shipped\n2026-08-01,2026-08-01-1100,6\n' > "$w/seed/docs/daily-logic-impact.csv"
    echo '{}' > "$w/seed/docs/diagnostics/latest.json"
    echo '<html>old</html>' > "$w/seed/docs/newsletter-archive/latest.html"
    git -C "$w/seed" add -A && git -C "$w/seed" commit -qm "seed" && git -C "$w/seed" push -q
    git clone -q "$w/origin.git" "$w/cloneA"; git_id "$w/cloneA"
    git clone -q "$w/origin.git" "$w/cloneB"; git_id "$w/cloneB"
}

send_run_writes() { # $1 = clone dir. Simulates what the send run writes (entries A + B).
    printf '{\n  "sent": [\n    { "id": "entry-A", "sentAt": "2026-08-01" },\n    { "id": "entry-B", "sentAt": "%s" }\n  ],\n  "lastSendDate": "%s"\n}\n' "$TODAY" "$TODAY" > "$1/docs/sent-articles.json"
    echo "<html>today's edition</html>" > "$1/docs/newsletter-archive/latest.html"
    echo '{"quality":{"score":90}}' > "$1/docs/diagnostics/latest.json"
    printf '{\n  "updatedAt": "%sT12:00:00Z",\n  "history": [\n    { "date": "2026-08-01", "runId": "2026-08-01-1100", "score": 70 },\n    { "date": "%s", "runId": "%s-1200", "score": 90 }\n  ]\n}\n' "$TODAY" "$TODAY" "$TODAY" > "$1/docs/quality-scores.json"
    printf 'date,runId,score\n2026-08-01,2026-08-01-1100,70\n%s,%s-1200,90\n' "$TODAY" "$TODAY" > "$1/docs/quality-scores.csv"
    printf 'date,run_id,articles_shipped\n2026-08-01,2026-08-01-1100,6\n%s,%s-1200,7\n' "$TODAY" "$TODAY" > "$1/docs/daily-logic-impact.csv"
}

racer_pushes() { # $1 = world. cloneB lands a competing commit on origin AFTER our
    # snapshot: adds independent sent entry C, a fresher feed build, and a
    # competing row in each cumulative history file.
    printf '{\n  "sent": [\n    { "id": "entry-A", "sentAt": "2026-08-01" },\n    { "id": "entry-C", "sentAt": "%s" }\n  ]\n}\n' "$TODAY" > "$1/cloneB/docs/sent-articles.json"
    echo '{"items":["newer-build"]}' > "$1/cloneB/docs/feed.json"
    printf '{\n  "updatedAt": "%sT11:00:00Z",\n  "history": [\n    { "date": "2026-08-01", "runId": "2026-08-01-1100", "score": 70 },\n    { "date": "%s", "runId": "%s-1100-racer", "score": 55 }\n  ]\n}\n' "$TODAY" "$TODAY" "$TODAY" > "$1/cloneB/docs/quality-scores.json"
    printf 'date,runId,score\n2026-08-01,2026-08-01-1100,70\n%s,%s-1100-racer,55\n' "$TODAY" "$TODAY" > "$1/cloneB/docs/quality-scores.csv"
    printf 'date,run_id,articles_shipped\n2026-08-01,2026-08-01-1100,6\n%s,%s-1100-racer,4\n' "$TODAY" "$TODAY" > "$1/cloneB/docs/daily-logic-impact.csv"
    git -C "$1/cloneB" add -A && git -C "$1/cloneB" commit -qm "racer: competing docs commit" && git -C "$1/cloneB" push -q
}

# The pre-patch retry loop, verbatim from send-only.yml (for defect reproduction).
old_loop() { # $1 = clone dir. Returns the loop's exit code.
    ( cd "$1" &&
      git add docs/sent-articles.json docs/feed.json docs/included-articles.json docs/diagnostics/ docs/quality-scores.json docs/quality-scores.csv docs/daily-logic-impact.csv &&
      git add -A docs/newsletter-archive/ &&
      git commit -qm "📧 Newsletter sent - old loop" &&
      for i in 1 2 3; do
        if git push -q 2>/dev/null; then echo "Push OK"; break; fi
        git fetch -q origin main && git rebase -q origin/main --strategy-option=ours 2>/dev/null || { git rebase --abort 2>/dev/null; git pull -q --no-rebase -X ours 2>/dev/null || true; }
      done )
}

origin_sent_json() { git -C "$1/origin.git" show main:docs/sent-articles.json; }

echo "== 1. Clean push (no contention) =="
make_world "$WORK/w1"
send_run_writes "$WORK/w1/cloneA"
( cd "$WORK/w1/cloneA" && bash "$SCRIPT" "msg" >/dev/null 2>&1 ); rc=$?
check "exits 0 on clean push" $rc
origin_sent_json "$WORK/w1" | grep -q "\"lastSendDate\": \"$TODAY\""; check "origin has lastSendDate stamp" $?

echo "== 2. RACE (A/B vs C): competing commit adds independent entry C after our snapshot =="
make_world "$WORK/w2"
send_run_writes "$WORK/w2/cloneA"       # ours: sent = [A, B(today)], lastSendDate = today
racer_pushes "$WORK/w2"                 # origin gains: sent = [A, C(today)], fresher feed
echo "--- BEFORE: our run's sent-articles.json (entries A, B):"
sed 's/^/    /' "$WORK/w2/cloneA/docs/sent-articles.json"
echo "--- BEFORE: competing commit's sent-articles.json on origin (entries A, C):"
origin_sent_json "$WORK/w2" | sed 's/^/    /'
( cd "$WORK/w2/cloneA" && bash "$SCRIPT" "msg" >/dev/null 2>&1 ); rc=$?
check "NEW script: exits 0 under race" $rc
echo "--- AFTER: merged sent-articles.json on origin/main:"
origin_sent_json "$WORK/w2" | sed 's/^/    /'
merged="$(origin_sent_json "$WORK/w2")"
echo "$merged" | grep -q '"entry-A"'; check "postcondition: origin contains entry A" $?
echo "$merged" | grep -q '"entry-B"'; check "postcondition: origin contains entry B (our send's dedup state)" $?
echo "$merged" | grep -q '"entry-C"'; check "postcondition: origin contains entry C (competing state NOT lost)" $?
echo "$merged" | grep -q "\"lastSendDate\": \"$TODAY\""; check "postcondition: lastSendDate is today" $?
git -C "$WORK/w2/origin.git" show main:docs/feed.json | grep -q 'newer-build'
check "postcondition: competing fresher feed.json survives (origin-wins policy)" $?

echo "== 2b. Same race against the OLD loop — reproduces the silent data loss =="
make_world "$WORK/w2b"
send_run_writes "$WORK/w2b/cloneA"
racer_pushes "$WORK/w2b"
old_loop "$WORK/w2b/cloneA" >/dev/null 2>&1; rc=$?
if [ $rc -eq 0 ] && ! origin_sent_json "$WORK/w2b" | grep -q '"entry-B"'; then
    ok "OLD loop reproduced: exits 0 (green) while entry B is MISSING from origin (rebase -X ours kept origin's file)"
else
    if origin_sent_json "$WORK/w2b" | grep -q '"entry-B"'; then
        bad "OLD loop unexpectedly preserved the entry (conflict did not trigger — fixture needs tightening)"
    else
        bad "OLD loop behaved unexpectedly (rc=$rc)"
    fi
fi

echo "== 3. ALL pushes rejected (audit finding 2) =="
make_world "$WORK/w3"
printf '#!/bin/sh\nexit 1\n' > "$WORK/w3/origin.git/hooks/pre-receive"
chmod +x "$WORK/w3/origin.git/hooks/pre-receive"
send_run_writes "$WORK/w3/cloneA"
( cd "$WORK/w3/cloneA" && COMMIT_SEND_STATE_ATTEMPTS=2 bash "$SCRIPT" "msg" >/dev/null 2>&1 ); rc=$?
[ $rc -ne 0 ]; check "NEW script: exits NONZERO when the state cannot reach origin (job goes red)" $?

echo "== 3b. Same rejection against the OLD loop — reproduces the silent green =="
make_world "$WORK/w3b"
printf '#!/bin/sh\nexit 1\n' > "$WORK/w3b/origin.git/hooks/pre-receive"
chmod +x "$WORK/w3b/origin.git/hooks/pre-receive"
send_run_writes "$WORK/w3b/cloneA"
old_loop "$WORK/w3b/cloneA" >/dev/null 2>&1; rc=$?
[ $rc -eq 0 ]; check "OLD loop reproduced: exits 0 (green) with the state never pushed" $?

echo "== 4. No changes -> no commit, exit 0 =="
make_world "$WORK/w4"
( cd "$WORK/w4/cloneA" && bash "$SCRIPT" "msg" >/dev/null 2>&1 ); rc=$?
check "exits 0 with nothing to commit" $rc
[ "$(git -C "$WORK/w4/origin.git" rev-list --count main)" = "1" ]; check "origin unchanged (still only the seed commit)" $?

echo "== 5. Idempotency: identical content already on origin =="
make_world "$WORK/w5"
send_run_writes "$WORK/w5/cloneA"
# Racer pushes the IDENTICAL state (as if our earlier push landed but the
# response was lost) — script must detect emptiness after resync and exit 0.
send_run_writes "$WORK/w5/cloneB"
git -C "$WORK/w5/cloneB" add -A && git -C "$WORK/w5/cloneB" commit -qm "identical" && git -C "$WORK/w5/cloneB" push -q
( cd "$WORK/w5/cloneA" && bash "$SCRIPT" "msg" >/dev/null 2>&1 ); rc=$?
check "exits 0 when origin already holds identical state" $rc

echo "== 6. RACE on cumulative history files (quality-scores, daily-logic-impact) =="
make_world "$WORK/w6"
send_run_writes "$WORK/w6/cloneA"       # ours adds row runId <today>-1200 to each history file
racer_pushes "$WORK/w6"                 # origin gains competing row runId <today>-1100-racer
echo "--- BEFORE: our quality-scores.csv:";      sed 's/^/    /' "$WORK/w6/cloneA/docs/quality-scores.csv"
echo "--- BEFORE: competing quality-scores.csv on origin:"
git -C "$WORK/w6/origin.git" show main:docs/quality-scores.csv | sed 's/^/    /'
( cd "$WORK/w6/cloneA" && bash "$SCRIPT" "msg" >/dev/null 2>&1 ); rc=$?
check "exits 0 under cumulative-file race" $rc
echo "--- AFTER: merged quality-scores.csv on origin/main:"
git -C "$WORK/w6/origin.git" show main:docs/quality-scores.csv | sed 's/^/    /'
qcsv="$(git -C "$WORK/w6/origin.git" show main:docs/quality-scores.csv)"
[ "$(echo "$qcsv" | head -1)" = "date,runId,score" ]; check "CSV header intact" $?
echo "$qcsv" | grep -q "2026-08-01-1100";  check "CSV: base row survives" $?
echo "$qcsv" | grep -q -- "-1100-racer";   check "CSV: competing racer row NOT lost" $?
echo "$qcsv" | grep -q "$TODAY,$TODAY-1200,90"; check "CSV: our run's row present" $?
[ "$(echo "$qcsv" | wc -l)" -eq 4 ]; check "CSV: exactly header + 3 rows (no duplicates)" $?
dli="$(git -C "$WORK/w6/origin.git" show main:docs/daily-logic-impact.csv)"
echo "$dli" | grep -q -- "-1100-racer" && echo "$dli" | grep -q "$TODAY-1200"
check "daily-logic-impact.csv: both racer and our rows present" $?
qjson="$(git -C "$WORK/w6/origin.git" show main:docs/quality-scores.json)"
echo "$qjson" | grep -q -- "-1100-racer" && echo "$qjson" | grep -q "$TODAY-1200" && echo "$qjson" | grep -q "2026-08-01-1100"
check "quality-scores.json: history is the union of all three runs" $?
echo "$qjson" | grep -q "\"updatedAt\": \"${TODAY}T12:00:00Z\""; check "quality-scores.json: updatedAt is ours" $?
git -C "$WORK/w6/origin.git" show main:docs/sent-articles.json | grep -q '"entry-C"'
check "sent-articles union holds in this world too" $?

echo ""
echo "$PASS passed, $FAIL failed"
[ $FAIL -eq 0 ]
