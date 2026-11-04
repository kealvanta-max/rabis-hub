#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Publish the production snapshot to a brand-new GitHub repository.
#
# Run this from the snapshot directory (default: /home/user/rabis-saving-hub-production):
#   ./scripts/publish-production-repo.sh [repo-name] [owner]
#
# Requires the GitHub CLI (`gh auth login`) with permission to create repos.
# ---------------------------------------------------------------------------
set -euo pipefail

REPO_NAME="${1:-rabis-saving-hub-production}"
OWNER="${2:-${GH_OWNER:-}}"

if ! command -v gh >/dev/null 2>&1; then
  echo "✖ GitHub CLI (gh) is not installed. Install it from https://cli.github.com/" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "✖ Not logged in to GitHub. Run: gh auth login" >&2
  exit 1
fi

if [ -z "$OWNER" ]; then
  OWNER="$(gh api user --jq .login)"
fi

FULL="$OWNER/$REPO_NAME"

if gh repo view "$FULL" >/dev/null 2>&1; then
  echo "✖ $FULL already exists. Choose another name or push manually." >&2
  exit 1
fi

echo "→ Creating private repository $FULL"
gh repo create "$FULL" \
  --private \
  --source . \
  --remote origin \
  --push \
  --description "Rabi's Saving Hub — production repository (Next.js 14 + Firebase + Vercel)"

echo "→ Tagging the release"
git tag -a v1.0.0 -m "Production release v1.0.0" 2>/dev/null || true
git push origin --tags

echo "→ Adding topics"
gh repo edit "$FULL" \
  --add-topic susu,ghana,nextjs,firebase,typescript,tailwindcss,vercel >/dev/null 2>&1 || true

echo "✅ Published: https://github.com/$FULL"
echo "Next: import the repo in Vercel and add the env vars from .env.example."
