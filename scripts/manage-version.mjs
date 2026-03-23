#!/usr/bin/env node
/**
 * public/app-meta.json のバージョン（semver）とデプロイ履歴を管理する。
 * bump: メジャー / マイナー / パッチを上げる（デプロイ前）
 * log-success: デプロイ成功時に履歴を追記（現在の version を記録）
 * log-failure: バージョンを巻き戻し、失敗したデプロイ試行を履歴に残す
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const META_PATH = path.join(ROOT, 'public', 'app-meta.json');
const MAX_DEPLOYMENTS = 100;

function load() {
  const raw = fs.readFileSync(META_PATH, 'utf8');
  return JSON.parse(raw);
}

function save(data) {
  fs.writeFileSync(META_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function bumpSemver(version, level) {
  const parts = String(version).split('.').map((n) => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  const [maj, min, pat] = parts;
  if (level === 'major') return `${maj + 1}.0.0`;
  if (level === 'minor') return `${maj}.${min + 1}.0`;
  if (level === 'patch') return `${maj}.${min}.${pat + 1}`;
  throw new Error(`Unknown level: ${level} (use major, minor, patch)`);
}

function nowIso() {
  return new Date().toISOString();
}

function deployer() {
  return (
    process.env.DEPLOYER ||
    process.env.USER ||
    process.env.USERNAME ||
    'unknown'
  );
}

function appendDeployment(data, entry) {
  if (!Array.isArray(data.deployments)) data.deployments = [];
  data.deployments.unshift(entry);
  data.deployments = data.deployments.slice(0, MAX_DEPLOYMENTS);
}

const cmd = process.argv[2];

if (cmd === 'bump') {
  const level = (process.argv[3] || 'patch').toLowerCase();
  const data = load();
  data.version = bumpSemver(data.version, level);
  save(data);
  console.log(data.version);
  process.exit(0);
}

if (cmd === 'log-success') {
  const data = load();
  appendDeployment(data, {
    version: data.version,
    deployedAt: nowIso(),
    deployedBy: deployer(),
    success: true,
    error: null,
  });
  save(data);
  process.exit(0);
}

if (cmd === 'log-failure') {
  const prevVersion = process.argv[3];
  const attemptedVersion = process.argv[4];
  const errMsg =
    process.env.DEPLOY_ERROR_MSG || 'Deploy failed (no details)';
  const data = load();
  data.version = prevVersion;
  appendDeployment(data, {
    version: attemptedVersion,
    deployedAt: nowIso(),
    deployedBy: deployer(),
    success: false,
    error: errMsg.slice(0, 8000),
  });
  save(data);
  process.exit(0);
}

console.error(
  'Usage: node scripts/manage-version.mjs bump [major|minor|patch]',
);
console.error(
  '       node scripts/manage-version.mjs log-success',
);
console.error(
  '       node scripts/manage-version.mjs log-failure <prevVersion> <attemptedVersion>',
);
console.error('       環境変数 DEPLOY_ERROR_MSG にエラー内容を渡してください');
process.exit(1);
