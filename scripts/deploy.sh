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

if [ -n "$(git status --porcelain)" ]; then
  echo "deploy: the working tree is dirty — the build would stamp uncommitted work as a"
  echo "        release, and the footer would name a commit that does not contain what is"
  echo "        on screen. Commit or stash first."
  exit 1
fi

npm run build

# what the footer of the page we are about to publish says about itself
STAMP=$(grep -oE '[0-9a-f]{7}\+? · [0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}' dist/index.html | head -1)
[ -n "$STAMP" ] || { echo "deploy: the built page carries no build stamp — refusing to ship it blind."; exit 1; }
echo "deploy: publishing build $STAMP"

cd dist
rm -rf .git
git init -q -b gh-pages
git add -A
git commit -qm "deploy $STAMP"
git push -f https://github.com/yankiakal/crownhold.git gh-pages:gh-pages
rm -rf .git
cd ..

# ── and now wait to actually see it ──
URL="https://yankiakal.github.io/crownhold/"
SHA=$(printf '%s' "$STAMP" | cut -d' ' -f1)
echo "deploy: waiting for $SHA to appear at $URL"
i=0
while [ "$i" -lt 40 ]; do
  i=$((i + 1))
  LIVE=$(curl -s --max-time 20 "$URL" | grep -oE '[0-9a-f]{7}\+? · [0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}' | head -1 || true)
  if [ "$LIVE" = "$STAMP" ]; then
    echo "deploy: live and verified — $URL is $STAMP"
    exit 0
  fi
  [ $((i % 4)) -eq 0 ] && echo "  still $([ -n "$LIVE" ] && echo "$LIVE" || echo 'unreadable')  (attempt $i/40)"
  sleep 15
done

echo ""
echo "deploy: FAILED TO VERIFY. The push succeeded but $URL still reports"
echo "        '${LIVE:-nothing}' rather than '$STAMP' after ten minutes."
echo "        GitHub's Pages workflow is what publishes this — check its run history."
exit 1
