#!/bin/sh
# Deploy Crownhold to GitHub Pages: build, then publish dist/ as the gh-pages branch.
set -e
cd "$(dirname "$0")/.."
npm run build
cd dist
rm -rf .git
git init -q -b gh-pages
git add -A
git commit -qm "deploy $(date +%Y-%m-%d_%H:%M)"
git push -f https://github.com/yankiakal/crownhold.git gh-pages:gh-pages
rm -rf .git
echo "Deployed: https://yankiakal.github.io/crownhold/"
