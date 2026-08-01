import { spawn, spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { checkForUpdates } from '../update';
import { renderCliHelp, renderPublishResult } from './ui';
import {
  DEFAULT_API_ENDPOINT,
  DEFAULT_MAX_BYTES,
  DEFAULT_RETRIES,
  DEFAULT_SITE_URL,
  DEFAULT_TIMEOUT_MS,
  INSTALL_COMMAND,
  RELEASE_REPO,
  UPDATE_SOURCE_URL,
  validateUrl,
  VERSION,
} from './runtime';

export {
  DEFAULT_API_ENDPOINT,
  DEFAULT_MAX_BYTES,
  DEFAULT_RETRIES,
  DEFAULT_SITE_URL,
  DEFAULT_TIMEOUT_MS,
  INSTALL_COMMAND,
  RELEASE_REPO,
  UPDATE_SOURCE_URL,
  validateUrl,
  VERSION,
};

export const ansi = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

export type Printer = {
  info: (message: string) => void;
  ok: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
  line: (message: string) => void;
};

export type PublishOptions = {
  path?: string;
  stdin?: boolean;
  title?: string;
  visibility?: 'public' | 'private';
  expireDays?: string;
  apiKey?: string;
  endpoint?: string;
  siteUrl?: string;
  timeout?: string;
  maxBytes?: string;
  retries?: string;
  dryRun?: boolean;
  json?: boolean;
  quiet?: boolean;
  copy: boolean;
  open: boolean;
  color: boolean;
  updateCheck: boolean;
};

export type SlugOptions = {
  path?: string;
  stdin?: boolean;
  maxBytes?: string;
  json?: boolean;
  color: boolean;
  updateCheck: boolean;
};

export type DoctorOptions = {
  endpoint?: string;
  color: boolean;
  json?: boolean;
  updateCheck: boolean;
};

export type LoginOptions = {
  apiKey?: string;
  username?: string;
};

export type NotesListOptions = {
  state?: 'active' | 'deleted';
  endpoint?: string;
  json?: boolean;
  color: boolean;
};

export type NotesReadOptions = {
  endpoint?: string;
  json?: boolean;
  color: boolean;
};

export type NotesVersionOptions = {
  endpoint?: string;
  json?: boolean;
  color: boolean;
};

export type NotesAskOptions = {
  question?: string;
  stdin?: boolean;
  endpoint?: string;
  json?: boolean;
  color: boolean;
};

export type NotesUpdateOptions = {
  path?: string;
  stdin?: boolean;
  title?: string;
  visibility?: 'public' | 'private';
  expireDays?: string;
  maxBytes?: string;
  endpoint?: string;
  json?: boolean;
  color: boolean;
};

export type NotesDeleteOptions = {
  permanent?: boolean;
  endpoint?: string;
  json?: boolean;
  color: boolean;
};

export type NotesRestoreVersionOptions = {
  endpoint?: string;
  json?: boolean;
  color: boolean;
};

export type LinksListOptions = {
  endpoint?: string;
  json?: boolean;
  color: boolean;
};

export type LinksCreateOptions = {
  key?: string;
  target?: string;
  label?: string;
  endpoint?: string;
  json?: boolean;
  color: boolean;
};

export type LinksUpdateOptions = {
  key?: string;
  target?: string;
  label?: string;
  endpoint?: string;
  json?: boolean;
  color: boolean;
};

export type LinksDeleteOptions = {
  endpoint?: string;
  json?: boolean;
  color: boolean;
};

export type InviteOptions = {
  username?: string;
  endpoint?: string;
  json?: boolean;
  color: boolean;
};

export type NotificationsListOptions = {
  endpoint?: string;
  json?: boolean;
  color: boolean;
};

export type NotificationsActionOptions = {
  endpoint?: string;
  json?: boolean;
  color: boolean;
};

export type ConfigOptions = {
  json?: boolean;
};

export type SelfUpdateOptions = {
  checkOnly?: boolean;
  yes?: boolean;
  quiet?: boolean;
  json?: boolean;
  color: boolean;
  updateCheck: boolean;
};

export type OptionValueSource = 'default' | 'config' | 'env' | 'cli' | 'implied';

export type CommandLike = {
  getOptionValueSource?: (key: string) => OptionValueSource | undefined;
};

export function colorize(text: string, code: string, enabled: boolean): string {
  if (!enabled) {
    return text;
  }

  return `${code}${text}${ansi.reset}`;
}

export function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function highlightJson(json: string, enableColor: boolean): string {
  if (!enableColor) {
    return json;
  }

  return json.replace(
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
    (match, quoted: string | undefined, keySuffix: string | undefined) => {
      if (quoted) {
        return keySuffix
          ? `${colorize(quoted, ansi.cyan, true)}${keySuffix}`
          : colorize(quoted, ansi.green, true);
      }

      if (match === 'true' || match === 'false') {
        return colorize(match, ansi.blue, true);
      }

      if (match === 'null') {
        return colorize(match, ansi.gray, true);
      }

      return colorize(match, ansi.yellow, true);
    }
  );
}

export function printJson(value: unknown, enableColor = process.stdout.isTTY): void {
  console.log(highlightJson(formatJson(value), enableColor));
}

export function createPrinter(enableColor: boolean, quiet: boolean): Printer {
  const infoPrefix = colorize('[info]', ansi.blue, enableColor);
  const okPrefix = colorize('[ok]', ansi.green, enableColor);
  const warnPrefix = colorize('[warn]', ansi.yellow, enableColor);
  const errorPrefix = colorize('[error]', ansi.red, enableColor);

  return {
    info(message: string) {
      if (!quiet) {
        console.log(`${infoPrefix} ${message}`);
      }
    },
    ok(message: string) {
      console.log(`${okPrefix} ${message}`);
    },
    warn(message: string) {
      console.log(`${warnPrefix} ${message}`);
    },
    error(message: string) {
      console.error(`${errorPrefix} ${message}`);
    },
    line(message: string) {
      console.log(message);
    },
  };
}

export function renderPublishOutput(input: {
  enableColor: boolean;
  dryRun: boolean;
  source: string;
  slug: string;
  url: string;
  elapsedMs?: number;
}): void {
  renderPublishResult(input);
}

export function renderTopHelp(enableColor: boolean): void {
  renderCliHelp(enableColor, VERSION);
}

export function getOptionSource(command: CommandLike, key: string): OptionValueSource | undefined {
  try {
    return command.getOptionValueSource?.(key);
  } catch {
    return undefined;
  }
}

export function optionProvidedByCli(command: CommandLike, key: string): boolean {
  return getOptionSource(command, key) === 'cli';
}

export function parsePositiveInt(raw: string | undefined, label: string): number {
  if (typeof raw !== 'string') {
    throw new Error(`${label} is required`);
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }

  return parsed;
}

export function parseOptionalPositiveInt(raw: string | undefined): number | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

export function parseOptionalBoolean(raw: string | undefined): boolean | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }

  const normalized = raw.trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return undefined;
}

export function validateResourceId(id: string, label: string): string {
  const normalized = id.trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(normalized)) {
    throw new Error(`${label} must be 1-128 letters, numbers, underscores, or dashes`);
  }
  return normalized;
}

export function parseTitleFromMarkdown(content: string): string {
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      return trimmed.slice(2).trim();
    }
  }
  return '';
}

export function parseVisibility(raw: string | undefined): 'public' | 'private' {
  return raw === 'private' ? 'private' : 'public';
}

export async function readMarkdownFile(
  filePath: string,
  maxBytes: number
): Promise<{ content: string; absolutePath: string }> {
  const absolutePath = path.resolve(filePath);
  const stat = await fs.stat(absolutePath);

  if (!stat.isFile()) {
    throw new Error(`path is not a file: ${absolutePath}`);
  }

  if (stat.size > maxBytes) {
    throw new Error(`file too large (${stat.size} bytes), max ${maxBytes}`);
  }

  const content = await fs.readFile(absolutePath, 'utf8');

  if (content.trim().length === 0) {
    throw new Error('file is empty or whitespace-only');
  }

  return { content, absolutePath };
}

export async function readMarkdownStdin(maxBytes: number): Promise<string> {
  if (process.stdin.isTTY) {
    throw new Error('stdin is empty. pass --path or pipe content with --stdin');
  }

  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    total += buffer.length;

    if (total > maxBytes) {
      throw new Error(`stdin payload too large (${total} bytes), max ${maxBytes}`);
    }

    chunks.push(buffer);
  }

  const content = Buffer.concat(chunks).toString('utf8');

  if (content.trim().length === 0) {
    throw new Error('stdin content is empty or whitespace-only');
  }

  return content;
}

export function hasBinary(command: string): boolean {
  const result = spawnSync(command, ['--version'], { stdio: 'ignore' });
  return result.status === 0;
}

export function copyToClipboard(value: string): boolean {
  const platform = process.platform;

  if (platform === 'darwin') {
    return spawnSync('pbcopy', [], { input: value, encoding: 'utf8' }).status === 0;
  }

  if (platform === 'linux') {
    const candidates: Array<[string, string[]]> = [
      ['wl-copy', []],
      ['xclip', ['-selection', 'clipboard']],
      ['xsel', ['--clipboard', '--input']],
    ];

    for (const [cmd, args] of candidates) {
      if (!hasBinary(cmd)) {
        continue;
      }

      const result = spawnSync(cmd, args, { input: value, encoding: 'utf8' });
      if (result.status === 0) {
        return true;
      }
    }

    return false;
  }

  if (platform === 'win32') {
    return spawnSync('clip', [], { input: value, encoding: 'utf8', shell: true }).status === 0;
  }

  return false;
}

export function openInBrowser(url: string): boolean {
  const platform = process.platform;

  try {
    if (platform === 'darwin') {
      spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
      return true;
    }

    if (platform === 'linux') {
      spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
      return true;
    }

    if (platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref();
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

export async function maybeCheckUpdates(enabled: boolean, printer: Printer): Promise<void> {
  if (!enabled) {
    return;
  }

  const result = await checkForUpdates({
    currentVersion: VERSION,
    sourceUrl: UPDATE_SOURCE_URL,
  });

  if (result.hasUpdate && result.latestVersion) {
    printer.warn(`update available: ${result.latestVersion} (current ${VERSION})`);
    printer.info(`run: ${INSTALL_COMMAND}`);
  }
}

export function getStringSetting(
  command: CommandLike,
  key: string,
  cliValue: string | undefined,
  envValue: string | undefined,
  configValue: string | undefined,
  fallback: string
): string {
  if (optionProvidedByCli(command, key)) {
    return cliValue ?? fallback;
  }

  if (typeof envValue === 'string' && envValue.trim()) {
    return envValue;
  }

  if (typeof configValue === 'string' && configValue.trim()) {
    return configValue;
  }

  return fallback;
}

export function getNumberSetting(
  command: CommandLike,
  key: string,
  cliValue: string | undefined,
  envValue: string | undefined,
  configValue: number | undefined,
  flagValue: number,
  fallback: number
): number {
  if (optionProvidedByCli(command, key)) {
    return parsePositiveInt(cliValue, key);
  }

  const fromEnv = parseOptionalPositiveInt(envValue);
  if (fromEnv !== undefined) {
    return fromEnv;
  }

  if (typeof configValue === 'number' && Number.isFinite(configValue) && configValue > 0) {
    return Math.floor(configValue);
  }

  if (Number.isFinite(flagValue) && flagValue > 0) {
    return Math.floor(flagValue);
  }

  return fallback;
}

export function getBooleanSetting(
  command: CommandLike,
  key: string,
  cliValue: boolean,
  envValue: string | undefined,
  configValue: boolean | undefined,
  flagValue: boolean,
  fallback: boolean
): boolean {
  if (optionProvidedByCli(command, key)) {
    return cliValue;
  }

  const fromEnv = parseOptionalBoolean(envValue);
  if (fromEnv !== undefined) {
    return fromEnv;
  }

  if (typeof configValue === 'boolean') {
    return configValue;
  }

  if (typeof flagValue === 'boolean') {
    return flagValue;
  }

  return fallback;
}

export function normalizeArgv(argv: string[]): string[] {
  const passthrough = [...argv];
  const bin = passthrough[0] ?? 'bun';
  const script = passthrough[1] ?? 'bri';
  const userArgs = passthrough.slice(2);

  if (userArgs[0] === 'run' && userArgs[1] === 'cli') {
    return [bin, script, ...userArgs.slice(2)];
  }

  if (userArgs[0] === 'cli') {
    return [bin, script, ...userArgs.slice(1)];
  }

  const first = passthrough[2];

  if (!first) {
    return [bin, script, '--help'];
  }

  const known = new Set([
    'publish',
    'slug',
    'doctor',
    'self-update',
    'login',
    'logout',
    'notes',
    'links',
    'notifications',
    'config',
    'help',
    '--help',
    '-h',
    '--version',
    '-V',
  ]);

  if (known.has(first)) {
    return passthrough;
  }

  if (first.startsWith('-')) {
    return [bin, script, 'publish', ...passthrough.slice(2)];
  }

  return [bin, script, 'publish', '--path', first, ...passthrough.slice(3)];
}
