#!/usr/bin/env bash
# Hosting デプロイ前に semver を上げ、完了後に public/app-meta.json にデプロイ履歴を追記します。
# VERSION_LEVEL: patch（既定）| minor | major
# DEPLOYER: 記録する名前（未設定時は USER）
# FIREBASE_TOKEN: 設定時は --non-interactive でデプロイ（CI 向け）
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

PROJECT_ID="new-check-137f9"
SITE_ID="tenpo-hikitugi-kakunin"
VERSION_LEVEL="${VERSION_LEVEL:-patch}"
export DEPLOYER="${DEPLOYER:-${USER:-unknown}}"

PREV_VERSION="$(node -p "JSON.parse(require('fs').readFileSync('public/app-meta.json','utf8')).version")"
node scripts/manage-version.mjs bump "$VERSION_LEVEL"
NEW_VERSION="$(node -p "JSON.parse(require('fs').readFileSync('public/app-meta.json','utf8')).version")"

DEPLOY_ERR="$(mktemp)"
trap 'rm -f "$DEPLOY_ERR"' EXIT

set +e
if [[ -n "${FIREBASE_TOKEN:-}" ]]; then
  firebase deploy --only hosting --project "${PROJECT_ID}" --non-interactive 2>"$DEPLOY_ERR"
else
  firebase deploy --only hosting --project "${PROJECT_ID}" 2>"$DEPLOY_ERR"
fi
EXIT_CODE=$?
set -e

if [[ "$EXIT_CODE" -eq 0 ]]; then
  node scripts/manage-version.mjs log-success
  : >"$DEPLOY_ERR"
  set +e
  if [[ -n "${FIREBASE_TOKEN:-}" ]]; then
    firebase deploy --only hosting --project "${PROJECT_ID}" --non-interactive 2>"$DEPLOY_ERR"
  else
    firebase deploy --only hosting --project "${PROJECT_ID}" 2>"$DEPLOY_ERR"
  fi
  META_SYNC=$?
  set -e
  if [[ "$META_SYNC" -ne 0 ]]; then
    echo "Warning: app-meta.json の再デプロイに失敗しました (exit ${META_SYNC})。履歴はローカルのみ更新されています。"
  fi
  echo "Deploy complete: https://${SITE_ID}.web.app (v${NEW_VERSION})"
else
  export DEPLOY_ERROR_MSG="$(head -c 8000 "$DEPLOY_ERR")"
  node scripts/manage-version.mjs log-failure "$PREV_VERSION" "$NEW_VERSION"
  echo "Deploy failed (exit ${EXIT_CODE}). Version reverted to v${PREV_VERSION}. Check deployments in public/app-meta.json"
  exit "$EXIT_CODE"
fi
