import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import {
  createQuickLink,
  createQuickLinkWithApiKey,
  listQuickLinks,
  listQuickLinksWithApiKey,
} from '@/lib/notes';
import {
  readBridgeApiKeyAuthFromRequest,
  rejectCookieBackedCrossOriginMutation,
  rejectCrossOriginMutation,
} from '@/lib/request-security';
import { resolveUserHandle, resolveUserHandleFromUser } from '@/lib/user-handle';

function statusFromErrorMessage(message: string): number {
  if (
    message.includes('No auth provider found') ||
    message.includes('Invalid token') ||
    message.includes('Not authenticated')
  ) {
    return 401;
  }
  return 500;
}

function sanitizeKey(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function normalizeUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

async function requireToken() {
  const { userId, getToken } = await auth();
  if (!userId) return null;
  const token = await getToken({ template: 'convex' });
  return token ?? null;
}

export async function GET(request: Request) {
  const token = await requireToken();
  if (token) {
    try {
      const data = await listQuickLinks({ token });
      return NextResponse.json({ data });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch quick links';
      return NextResponse.json({ error: message }, { status: statusFromErrorMessage(message) });
    }
  }

  const apiKeyAuth = await readBridgeApiKeyAuthFromRequest(request);
  if (!apiKeyAuth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    const data = await listQuickLinksWithApiKey({ apiKey: apiKeyAuth.apiKey });
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch quick links';
    const status =
      message === 'Invalid API key'
        ? 401
        : message === 'API key lacks read permission'
          ? 403
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  let payload: { key?: unknown; targetUrl?: unknown; label?: unknown };

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const key = sanitizeKey(payload.key);
  const targetUrl = normalizeUrl(payload.targetUrl);
  const label = typeof payload.label === 'string' ? payload.label.trim() || null : null;

  if (!key) {
    return NextResponse.json({ error: 'Quick link key is required' }, { status: 400 });
  }

  if (!targetUrl) {
    return NextResponse.json({ error: 'Target URL is required' }, { status: 400 });
  }

  const token = await requireToken();
  if (token) {
    const blocked = rejectCrossOriginMutation(request);
    if (blocked) return blocked;

    const { sessionClaims, userId } = await auth();
    const user = await currentUser();
    const username =
      resolveUserHandle(sessionClaims as Record<string, unknown> | null | undefined) ??
      resolveUserHandleFromUser(user) ??
      (typeof userId === 'string' ? userId.toLowerCase().replace(/[^a-z0-9_-]/g, '') : null);
    if (!username) return NextResponse.json({ error: 'Username is required' }, { status: 400 });

    try {
      const data = await createQuickLink({
        token,
        username,
        key,
        targetUrl,
        label,
      });
      return NextResponse.json({ data }, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create quick link';
      const status =
        message === 'Quick link key is required' ||
        message === 'Target URL is required' ||
        message.startsWith('Invalid target URL')
          ? 400
          : message === 'Quick link key already exists'
            ? 409
            : 500;
      return NextResponse.json({ error: message }, { status });
    }
  }

  const apiKeyAuth = await readBridgeApiKeyAuthFromRequest(request);
  if (!apiKeyAuth) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const blocked = rejectCookieBackedCrossOriginMutation(request, apiKeyAuth);
  if (blocked) return blocked;

  try {
    const data = await createQuickLinkWithApiKey({
      apiKey: apiKeyAuth.apiKey,
      key,
      targetUrl,
      label,
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create quick link';
    const status =
      message === 'Invalid API key'
        ? 401
        : message === 'API key lacks write permission'
          ? 403
          : message === 'Quick link key is required' ||
              message === 'Target URL is required' ||
              message.startsWith('Invalid target URL')
            ? 400
            : message === 'Quick link key already exists'
              ? 409
              : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
