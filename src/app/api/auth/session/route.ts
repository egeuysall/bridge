import { NextResponse } from 'next/server';
import {
  getBridgeApiKeySessionCookieName,
  getBridgeApiKeySessionCookieOptions,
  rejectSameOriginMutation,
  sealBridgeApiKeySession,
  verifyBridgeApiKey,
} from '@/lib/request-security';

export async function POST(request: Request) {
  const originError = rejectSameOriginMutation(request);
  if (originError) return originError;

  let payload: { apiKey?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const apiKey =
    typeof payload.apiKey === 'string' && payload.apiKey.length <= 512
      ? payload.apiKey.trim()
      : '';
  let verified: Awaited<ReturnType<typeof verifyBridgeApiKey>>;
  try {
    verified = apiKey ? await verifyBridgeApiKey(apiKey) : null;
  } catch {
    return NextResponse.json({ error: 'API key sign-in is temporarily unavailable' }, { status: 503 });
  }
  if (!verified) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }
  if (verified.permissions !== 'read_write') {
    return NextResponse.json({ error: 'API key must have read/write permission' }, { status: 403 });
  }

  let sealed: string;
  try {
    sealed = await sealBridgeApiKeySession(apiKey);
  } catch {
    return NextResponse.json({ error: 'API key web sessions are not configured' }, { status: 500 });
  }

  const response = NextResponse.json({ data: { username: verified.username } });
  response.cookies.set(
    getBridgeApiKeySessionCookieName(),
    sealed,
    getBridgeApiKeySessionCookieOptions()
  );
  return response;
}
