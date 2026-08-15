import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'crypto';
import { fetchQuery } from 'convex/nextjs';
import { NextResponse } from 'next/server';
import { api } from '../../convex/_generated/api';

const API_KEY_PATTERN = /^bri_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const SESSION_COOKIE_NAME = 'bri_api_key_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const SESSION_VERSION = 1;

type ApiKeyPermission = 'read' | 'write' | 'read_write';
type BridgeApiKeySource = 'bearer' | 'cookie';

export type BridgeApiKeyAuth = {
  apiKey: string;
  source: BridgeApiKeySource;
  username?: string;
  permissions?: ApiKeyPermission;
};

type SealedSession = {
  v: number;
  apiKey: string;
  exp: number;
};

export function readBridgeApiKeyFromRequest(request: Request): string | null {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(' ');
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') return null;

  const normalized = token.trim();
  if (!normalized || normalized.length > 512) return null;
  if (!API_KEY_PATTERN.test(normalized)) return null;

  return normalized;
}

export function getBridgeApiKeySessionCookieName(): string {
  return SESSION_COOKIE_NAME;
}

export function getBridgeApiKeySessionMaxAgeSeconds(): number {
  return SESSION_MAX_AGE_SECONDS;
}

export function getBridgeApiKeySessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export function getExpiredBridgeApiKeySessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  };
}

function getSessionSecretKey(): Buffer | null {
  const secret = process.env.BRI_API_KEY_SESSION_SECRET || process.env.CLERK_SECRET_KEY;
  if (!secret || secret.length < 32) return null;
  return createHash('sha256').update(secret).digest();
}

function parsePrefix(apiKey: string): string | null {
  const separatorIndex = apiKey.indexOf('.');
  return separatorIndex > 0 ? apiKey.slice(0, separatorIndex) : null;
}

export function hashBridgeApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

export async function verifyBridgeApiKey(apiKey: string) {
  if (apiKey.length > 512 || !API_KEY_PATTERN.test(apiKey)) return null;
  const prefix = parsePrefix(apiKey);
  if (!prefix) return null;

  return await fetchQuery(api.apiKeys.verifyHashed, {
    prefix,
    keyHash: hashBridgeApiKey(apiKey),
  });
}

function readCookieValue(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;

  for (const cookie of cookieHeader.split(';')) {
    const separatorIndex = cookie.indexOf('=');
    if (separatorIndex <= 0) continue;
    const key = cookie.slice(0, separatorIndex).trim();
    if (key !== name) continue;
    return cookie.slice(separatorIndex + 1).trim() || null;
  }

  return null;
}

function safeEqualString(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export async function sealBridgeApiKeySession(apiKey: string): Promise<string> {
  const key = getSessionSecretKey();
  if (!key) throw new Error('API key web sessions are not configured');

  const session: SealedSession = {
    v: SESSION_VERSION,
    apiKey,
    exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(session), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, ciphertext]).toString('base64url');
}

async function readBridgeApiKeyAuthFromCookie(request: Request): Promise<BridgeApiKeyAuth | null> {
  const sealed = readCookieValue(request, SESSION_COOKIE_NAME);
  if (!sealed || sealed.length > 4096) return null;

  const key = getSessionSecretKey();
  if (!key) return null;

  try {
    const packed = Buffer.from(sealed, 'base64url');
    if (packed.length <= 28) return null;
    const iv = packed.subarray(0, 12);
    const tag = packed.subarray(12, 28);
    const ciphertext = packed.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
      'utf8'
    );
    const session = JSON.parse(plaintext) as Partial<SealedSession>;

    if (
      session.v !== SESSION_VERSION ||
      typeof session.apiKey !== 'string' ||
      !API_KEY_PATTERN.test(session.apiKey) ||
      typeof session.exp !== 'number' ||
      session.exp <= Date.now()
    ) {
      return null;
    }

    const verified = await verifyBridgeApiKey(session.apiKey);
    if (!verified || verified.permissions !== 'read_write') return null;
    if (!safeEqualString(verified.prefix, parsePrefix(session.apiKey) ?? '')) return null;

    return {
      apiKey: session.apiKey,
      source: 'cookie',
      username: verified.username,
      permissions: verified.permissions,
    };
  } catch {
    return null;
  }
}

export async function readBridgeApiKeyAuthFromRequest(
  request: Request
): Promise<BridgeApiKeyAuth | null> {
  const bearerApiKey = readBridgeApiKeyFromRequest(request);
  if (bearerApiKey) return { apiKey: bearerApiKey, source: 'bearer' };

  return await readBridgeApiKeyAuthFromCookie(request);
}

export async function getBridgeApiKeySessionFromRequest(
  request: Request
): Promise<BridgeApiKeyAuth | null> {
  return await readBridgeApiKeyAuthFromCookie(request);
}

export function rejectCookieBackedCrossOriginMutation(
  request: Request,
  apiKeyAuth: BridgeApiKeyAuth | null
): NextResponse | null {
  if (apiKeyAuth?.source !== 'cookie') return null;

  return rejectSameOriginMutation(request);
}

export function rejectSameOriginMutation(request: Request): NextResponse | null {
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
    return null;
  }

  const targetOrigin = new URL(request.url).origin;
  const originHeader = request.headers.get('origin');
  const refererHeader = request.headers.get('referer');
  const candidate = originHeader || refererHeader;

  if (!candidate) {
    return NextResponse.json({ error: 'Missing request origin' }, { status: 403 });
  }

  try {
    if (new URL(candidate).origin !== targetOrigin) {
      return NextResponse.json({ error: 'Cross-origin request blocked' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
  }

  return null;
}

export function rejectCrossOriginMutation(request: Request): NextResponse | null {
  const targetOrigin = new URL(request.url).origin;
  const originHeader = request.headers.get('origin');
  const refererHeader = request.headers.get('referer');

  const hasBrowserOriginSignals = Boolean(originHeader || refererHeader);
  if (!hasBrowserOriginSignals) return null;

  try {
    if (originHeader && new URL(originHeader).origin !== targetOrigin) {
      return NextResponse.json({ error: 'Cross-origin request blocked' }, { status: 403 });
    }

    if (!originHeader && refererHeader && new URL(refererHeader).origin !== targetOrigin) {
      return NextResponse.json({ error: 'Cross-origin request blocked' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
  }

  return null;
}

export function clampAnalyticsDays(raw: string | null, fallback = 30): number {
  const parsed = Number(raw ?? String(fallback));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(90, Math.floor(parsed)));
}

export function normalizeResourceId(raw: string): string | null {
  const value = raw.trim();
  if (!value || value.length > 128) return null;
  if (!/^[A-Za-z0-9]+$/.test(value)) return null;
  return value;
}
