#!/bin/sh
# Deploy Crownhold to GitHub Pages: build, publish dist/ as gh-pages, then CHECK IT LANDED.
#
# The check is the point. This script used to print "Deployed: <url>" the instant the
# force-push succeeded — but pushing gh-pages only hands the work to GitHub's own Pages
# workflow, which runs afterwards and can fail. It did: the run for gh-pages 2f36076 failed
# after ten minutes while this script had already reported success, so v1.48 sat undeployed
# behind a live v1.47 and the only reason anyone noticed was the build stamp in the footer.
#
# Rapid successive force-pushes are the likely trigger — Pages permits one deployment in
# flight, so six deploys in an hour leave superseded runs to queue and time out. Either way
# the fix is the same: do not claim a deploy that has not been observed.
set -e
cd "$(dirname "$0")/.."

# Uncommitted SOURCE is the danger — a build from it stamps a commit that does not contain
# what is on screen. index.html is excluded because it IS the build output: the stamp changes
# it on every build, so the tree is dirty immediately after one, and the guard blocked every
# deploy that followed a build until this exclusion existed.
DIRTY=$(git status --porcelain -- . ':(exclude)index.html')
if [ -n "$DIRTY" ]; then
  echo "deploy: uncommitted source changes — a build from them would stamp a commit that"
  echo "        does not contain what is on screen. Commit or stash first:"
  echo "$DIRTY" | sed 's/^/          /'
  exit 1
fi

/usr/bin/env python3 - <<'PYWAIT'
# Wait for the field to be clear before pushing.
#
# GitHub's deploy-pages step can take ten minutes, and starting a second deployment while
# one is in flight makes them contend — the loser reports failure. Measured from the run
# history: deploys at 11:41, 11:57, 12:12 and 12:26 all failed while the 12:01 one, which
# happened to get a clear window, succeeded. Three versions sat unpublished because this
# script pushed on top of its own previous deployment.
#
# Unauthenticated read of a public repo, so it needs no token. If the API cannot be reached
# it proceeds rather than blocking a deploy on a network hiccup.
import json, time, urllib.request

API = 'https://api.github.com/repos/yankiakal/crownhold/deployments?environment=github-pages&per_page=3'
def busy():
    try:
        deps = json.load(urllib.request.urlopen(API, timeout=20))
        for d in deps:
            st = json.load(urllib.request.urlopen(d['statuses_url'] + '?per_page=1', timeout=20))
            if st and st[0]['state'] in ('in_progress', 'queued', 'pending'):
                return d['id']
    except Exception:
        return None
    return None

for i in range(40):
    who = busy()
    if not who:
        break
    if i == 0:
        print('deploy: deployment %s is still in flight — waiting for it rather than racing it' % who)
    time.sleep(15)
PYWAIT

npm run build

# what the footer of the page we are about to publish says about itself
STAMP=$(grep -oE '[0-9a-f]{7}\+? · [0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}' dist/index.html | head -1)
[ -n "$STAMP" ] || { echo "deploy: the built page carries no build stamp — refusing to ship it blind."; exit 1; }
echo "deploy: publishing build $STAMP"

# Publish onto the EXISTING gh-pages history rather than replacing it.
#
# This used to `rm -rf .git && git init && push -f`, so every deploy handed Pages a brand-new
# orphan history with one commit in it. That is one of the few remaining differences between
# this repo and a working branch deploy, and worth eliminating: the Pages source is correct,
# no deployment is wedged, the branch policy allows gh-pages, and a deploy with a completely
# clear field still timed out at exactly 10m02s in the publish step. A continuous history is
# what the branch route expects.
REMOTE=https://github.com/yankiakal/crownhold.git
WORK=$(mktemp -d)
if git clone -q --branch gh-pages --single-branch --depth 1 "$REMOTE" "$WORK/gh" 2>/dev/null; then
  # keep the history, replace the contents
  find "$WORK/gh" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
else
  echo "deploy: no gh-pages branch yet — starting one"
  mkdir -p "$WORK/gh" && (cd "$WORK/gh" && git init -q -b gh-pages && git remote add origin "$REMOTE")
fi
cp -R dist/. "$WORK/gh/"
# Jekyll has nothing to do here — the page is one self-contained file — and its Liquid parser
# would happily try to interpret {{ }} sequences inside a minified bundle.
touch "$WORK/gh/.nojekyll"
(
  cd "$WORK/gh"
  git add -A
  git -c user.email=deploy@crownhold -c user.name=deploy commit -qm "deploy $STAMP" || {
    echo "deploy: nothing changed since the last deploy"; exit 0; }
  git push -q origin gh-pages
)
rm -rf "$WORK"

# ── and now wait to actually see it ──
URL="https://yankiakal.github.io/crownhold/"
SHA=$(printf '%s' "$STAMP" | cut -d' ' -f1)
echo "deploy: waiting for $SHA to appear at $URL"
i=0
while [ "$i" -lt 40 ]; do
  i=$((i + 1))
  LIVE=$(curl -s --max-time 20 "$URL" | grep -oE '[0-9a-f]{7}\+? · [0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}' | head -1 || true)
  # Compare the COMMIT only. The timestamp is stamped per BUILD, not per commit, and when Pages
  # builds from source rather than serving the pushed artefact it produces its own — so matching
  # the full stamp reported FAILED TO VERIFY on a deploy that had in fact published correctly,
  # which is the worst possible direction for this check to be wrong in.
  LIVE_SHA=${LIVE%% *}
  if [ -n "$LIVE_SHA" ] && [ "$LIVE_SHA" = "$SHA" ]; then
    echo "deploy: live and verified — $URL is serving $LIVE"
    exit 0
  fi
  [ $((i % 4)) -eq 0 ] && echo "  still $([ -n "$LIVE" ] && echo "$LIVE" || echo 'unreadable')  (attempt $i/40)"
  sleep 15
done

echo ""
echo "deploy: FAILED TO VERIFY. The push succeeded but $URL still reports"
echo "        '${LIVE:-nothing}' rather than commit $SHA after ten minutes."
echo "        GitHub's Pages workflow is what publishes this — check its run history."
exit 1
