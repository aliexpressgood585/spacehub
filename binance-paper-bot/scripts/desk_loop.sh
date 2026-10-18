# Helpers for .github/workflows/binance-paper-desk.yml.
# Sourced, not executed. Every git/gh call is wrapped so a stuck HTTP
# conversation cannot hold the desk until the job timeout.

: "${GIT_TIMEOUT:=30}"
: "${GIT_KILL_AFTER:=10}"
: "${PUBLISH_STALE_S:=600}"

git_t() {
  timeout --kill-after="${GIT_KILL_AFTER}s" "${GIT_TIMEOUT}s" git "$@"
}

gh_t() {
  timeout --kill-after="${GIT_KILL_AFTER}s" "${GIT_TIMEOUT}s" gh "$@"
}

# True when the last landed publish is at least PUBLISH_STALE_S seconds old.
publish_stale() {
  local now=$1 last=$2
  [ $((now - last)) -ge "$PUBLISH_STALE_S" ]
}

# Push pm-desk-data. A minute tick rewrites state.json and leaves it unstaged
# when nothing filled; `git pull --rebase` then refuses ("unstaged changes")
# and every later push is rejected. Park that file, rebase, push, put the
# newest bytes back unstaged.
# During a rebase, `ours` is the upstream and `theirs` is the commit being
# replayed. `-X theirs` keeps this loop's account when state.json conflicts.
# `-X ours` would silently drop it.
push_state() {
  local saved="" stashed=0 rc=0
  if [ -f binance-paper/state.json ]; then
    if ! git diff --quiet -- binance-paper/state.json || ! git diff --cached --quiet -- binance-paper/state.json; then
      saved=$(mktemp)
      cp binance-paper/state.json "$saved"
      if ! git checkout -q HEAD -- binance-paper/state.json; then
        cp "$saved" binance-paper/state.json
        rm -f "$saved"
        return 1
      fi
    fi
  fi
  if ! git diff --quiet || ! git diff --cached --quiet; then
    if ! git_t stash push -q -m desk-publish; then
      if [ -n "$saved" ]; then
        cp "$saved" binance-paper/state.json
        rm -f "$saved"
      fi
      return 1
    fi
    stashed=1
  fi
  if ! git_t push -q origin pm-desk-data; then
    if git_t pull -q --rebase -X theirs origin pm-desk-data && git_t push -q origin pm-desk-data; then
      rc=0
    else
      rc=1
    fi
  fi
  if [ "$stashed" -eq 1 ]; then
    git_t stash pop -q || true
  fi
  if [ -n "$saved" ]; then
    cp "$saved" binance-paper/state.json
    rm -f "$saved"
  fi
  return "$rc"
}
