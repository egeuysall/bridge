import process from 'node:process';
import versionManifest from '../version.json';

export const VERSION = versionManifest.version;
export const DEFAULT_SITE_URL = (process.env.BRI_SITE_URL ?? 'https://bri.fyi').replace(/\/+$/, '');
export const DEFAULT_API_ENDPOINT = `${DEFAULT_SITE_URL}/api/notes`;
export const RELEASE_REPO = 'egeuysall/bri';
export const UPDATE_SOURCE_URL = `https://api.github.com/repos/${RELEASE_REPO}/releases/latest`;
export const INSTALL_COMMAND = `curl -fsSL ${DEFAULT_SITE_URL}/install.sh | bash`;
export const DEFAULT_TIMEOUT_MS = 10_000;
export const DEFAULT_MAX_BYTES = 1_048_576;
export const DEFAULT_RETRIES = 2;

export function validateUrl(raw: string, label: string): URL {
  let parsed: URL;

  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${label} is not a valid URL`);
  }

  const local = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && local)) {
    throw new Error(`${label} must use https (http allowed only for localhost)`);
  }

  return parsed;
}
