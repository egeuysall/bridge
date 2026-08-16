import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DEFAULT_SITE_URL } from './core/shared';

interface GitHubRelease {
  tag_name?: string;
  html_url?: string;
}

export interface SelfUpdateResult {
  status: 'up-to-date' | 'update-available' | 'updated';
  currentVersion: string;
  latestVersion: string;
  releaseUrl?: string;
  managedByHomebrew?: boolean;
}

function isHomebrewManaged(): boolean {
  return [process.argv[1], process.execPath].some((candidate) => {
    if (!candidate || ['bun', 'node', 'nodejs'].includes(path.basename(candidate))) return false;
    try {
      return realpathSync(candidate).includes(`${path.sep}Cellar${path.sep}`);
    } catch {
      return false;
    }
  });
}

function runHomebrewUpgrade(): void {
  for (const args of [['update'], ['upgrade', 'bri']]) {
    const result = spawnSync('brew', args, { stdio: 'inherit' });
    if (result.error || result.status !== 0) {
      throw new Error(`Homebrew ${args.join(' ')} failed`);
    }
  }
}

function normalizeVersion(raw: string): string {
  return raw.trim().replace(/^v/i, '');
}

function parseSemver(input: string): [number, number, number] {
  const match = normalizeVersion(input).match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return [0, 0, 0];
  return [
    Number.parseInt(match[1] ?? '0', 10),
    Number.parseInt(match[2] ?? '0', 10),
    Number.parseInt(match[3] ?? '0', 10),
  ];
}

function isNewerVersion(remote: string, current: string): boolean {
  const [ra, rb, rc] = parseSemver(remote);
  const [ca, cb, cc] = parseSemver(current);

  if (ra !== ca) return ra > ca;
  if (rb !== cb) return rb > cb;
  return rc > cc;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'bri-cli',
    },
  });

  if (!response.ok) {
    throw new Error(`request failed (${response.status}) for ${url}`);
  }

  return (await response.json()) as T;
}

function isAllowedInstallerUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'https:') {
      return true;
    }

    if (parsed.protocol === 'http:') {
      return (
        parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1' ||
        parsed.hostname === '::1'
      );
    }

    return false;
  } catch {
    return false;
  }
}

async function runInstaller(url: string): Promise<void> {
  if (process.platform === 'win32') {
    throw new Error('self-update is not supported on Windows in bun-runtime mode');
  }

  if (!isAllowedInstallerUrl(url)) {
    throw new Error(`unsupported installer url: ${url}`);
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'text/plain,*/*',
      'User-Agent': 'bri-cli',
    },
  });

  if (!response.ok) {
    throw new Error(`failed to download installer (${response.status}) from ${url}`);
  }

  const script = await response.text();
  if (!script.includes('#!/usr/bin/env bash') && !script.includes('#!/bin/bash')) {
    throw new Error('installer payload does not look like a shell installer');
  }

  const tmpPath = path.join(os.tmpdir(), `bri-install-${Date.now()}-${randomUUID()}.sh`);

  await fs.writeFile(tmpPath, script, { mode: 0o700 });
  await fs.chmod(tmpPath, 0o700);

  try {
    const result = spawnSync('/bin/bash', [tmpPath], {
      stdio: 'inherit',
      env: process.env,
    });

    if (result.error) {
      throw result.error;
    }

    if (typeof result.status === 'number' && result.status !== 0) {
      throw new Error(`installer exited with code ${result.status}`);
    }

    if (result.status === null) {
      const signal = result.signal ?? 'unknown';
      throw new Error(`installer terminated by signal ${signal}`);
    }
  } finally {
    await fs.rm(tmpPath, { force: true });
  }
}

export async function performSelfUpdate(options: {
  currentVersion: string;
  repo: string;
  checkOnly?: boolean;
}): Promise<SelfUpdateResult> {
  const currentVersion = normalizeVersion(options.currentVersion);

  if (!options.checkOnly && isHomebrewManaged()) {
    runHomebrewUpgrade();
    return {
      status: 'updated',
      currentVersion,
      latestVersion: currentVersion,
      releaseUrl: `https://github.com/${options.repo}/releases`,
      managedByHomebrew: true,
    };
  }

  const release = await fetchJson<GitHubRelease>(
    `https://api.github.com/repos/${options.repo}/releases/latest`
  );

  const latestVersion = normalizeVersion(release.tag_name ?? '');
  if (!latestVersion) {
    throw new Error('latest release is missing tag_name');
  }

  if (!isNewerVersion(latestVersion, currentVersion)) {
    return {
      status: 'up-to-date',
      currentVersion,
      latestVersion,
      releaseUrl: release.html_url,
    };
  }

  if (options.checkOnly) {
    return {
      status: 'update-available',
      currentVersion,
      latestVersion,
      releaseUrl: release.html_url,
    };
  }

  const installerUrl = process.env.BRI_INSTALLER_URL ?? `${DEFAULT_SITE_URL}/install.sh`;
  await runInstaller(installerUrl);

  return {
    status: 'updated',
    currentVersion,
    latestVersion,
    releaseUrl: release.html_url,
  };
}
