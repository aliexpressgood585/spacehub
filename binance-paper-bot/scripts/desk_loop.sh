# Helpers for .github/workflows/binance-paper-desk.yml.
# Sourced, not executed. Every git/gh call is wrapped so a stuck HTTP
# conversation cannot hold the desk until the job timeout.

: "${GIT_TIMEOUT:=30}"
: "${GIT_KILL_AFTER:=10}"
: "${PUSH_TIMEOUT:=20}"
: "${PUBLISH_STALE_S:=600}"
: "${PUSH_ATTEMPTS:=4}"

git_t() {
  timeout --kill-after="${GIT_KILL_AFTER}s" "${GIT_TIMEOUT}s" git "$@"
}

# Push has its own ceiling. A blocked credential helper or a stalled HTTP
# POST must not sit until the job timeout.
git_push() {
  timeout --kill-after="${GIT_KILL_AFTER}s" "${PUSH_TIMEOUT}s" git push "$@"
}

gh_t() {
  timeout --kill-after="${GIT_KILL_AFTER}s" "${GIT_TIMEOUT}s" gh "$@"
}

# True when the last landed publish is at least PUBLISH_STALE_S seconds old.
publish_stale() {
  local now=$1 last=$2
  [ $((now - last)) -ge "$PUBLISH_STALE_S" ]
}

# Sleep before retry n (1-based). pm/pmc/pmn push this same branch every few
# seconds; a fixed delay locks step with them.
push_backoff() {
  local n=${1:-1}
  local ms=$(( (RANDOM % 800) + 200 + n * 400 ))
  sleep "$(awk -v ms="$ms" 'BEGIN { printf "%.3f", ms / 1000 }')"
}

# Publish binance-paper/ onto pm-desk-data.
#
# Other desks commit pm/, pmc/, and pmn/ to this branch every few seconds, so
# a plain push is rejected and a rebase of our commit replays onto a tree we
# do not own (and refuses to start when state.json is still dirty). Instead:
# snapshot binance-paper/, fetch, reset to origin, put only that snapshot
# back, commit, push. A rejected push waits a jittered moment and retries.
# The newest account file wins. Other desks' files are not part of the commit.
push_state() {
  local snap attempt=1 rc=1
  snap=$(mktemp -d)
  if [ -d binance-paper ]; then
    mkdir -p "$snap/binance-paper"
    cp -a binance-paper/. "$snap/binance-paper/"
  fi
  while [ "$attempt" -le "$PUSH_ATTEMPTS" ]; do
    if ! git_t fetch -q origin pm-desk-data; then
      echo "fetch pm-desk-data failed (attempt ${attempt})"
    elif ! git_t reset -q --hard origin/pm-desk-data; then
      echo "reset to origin/pm-desk-data failed (attempt ${attempt})"
    else
      rm -rf binance-paper
      mkdir -p binance-paper
      if [ -d "$snap/binance-paper" ]; then
        cp -a "$snap/binance-paper/." binance-paper/
      fi
      git add -A -- binance-paper
      if git diff --cached --quiet -- binance-paper; then
        rm -rf "$snap"
        return 0
      fi
      if git commit -q -m "binance paper desk state $(date -u +%FT%TZ) [skip ci]"; then
        if git_push -q origin pm-desk-data; then
          rm -rf "$snap"
          return 0
        fi
        echo "push rejected (attempt ${attempt}); pm-desk-data moved"
      else
        echo "binance-paper commit failed (attempt ${attempt})"
      fi
    fi
    if [ "$attempt" -lt "$PUSH_ATTEMPTS" ]; then
      push_backoff "$attempt"
    fi
    attempt=$((attempt + 1))
  done
  # Keep the account file. Leave the branch ahead of the last fetch when a
  # commit exists so the next minute retries instead of looking in sync.
  if [ -d "$snap/binance-paper" ]; then
    rm -rf binance-paper
    mkdir -p binance-paper
    cp -a "$snap/binance-paper/." binance-paper/
    git add -A -- binance-paper || true
    git diff --cached --quiet -- binance-paper || git commit -q -m "binance paper desk state $(date -u +%FT%TZ) [skip ci]" || true
  fi
  rm -rf "$snap"
  echo "::warning::binance-paper push failed after ${PUSH_ATTEMPTS} attempts"
  return "$rc"
}
