#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';

const cliManifestPath = 'cli/version.json';
const publicManifestPath = 'public/bri-version.json';

const cliManifest = JSON.parse(readFileSync(cliManifestPath, 'utf8'));
const version = String(process.argv[2] ?? cliManifest.version ?? '').trim();

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`Invalid CLI version: ${version || '<empty>'}`);
}

const releaseUrl =
  typeof cliManifest.releaseUrl === 'string' && cliManifest.releaseUrl.trim()
    ? cliManifest.releaseUrl.trim()
    : 'https://github.com/egeuysall/bri/releases';

const normalized = `${JSON.stringify({ version, releaseUrl }, null, 2)}\n`;

writeFileSync(cliManifestPath, normalized);
writeFileSync(publicManifestPath, normalized);
