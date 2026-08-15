import { NextResponse } from 'next/server';
import {
  getBridgeApiKeySessionCookieName,
  getExpiredBridgeApiKeySessionCookieOptions,
  rejectSameOriginMutation,
} from '@/lib/request-security';

export async function POST(request: Request) {
  const originError = rejectSameOriginMutation(request);
  if (originError) return originError;

  const response = NextResponse.json({ data: { signedOut: true } });
  response.cookies.set(
    getBridgeApiKeySessionCookieName(),
    '',
    getExpiredBridgeApiKeySessionCookieOptions()
  );
  return response;
}
