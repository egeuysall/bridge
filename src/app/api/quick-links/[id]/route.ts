import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import {
  removeQuickLink,
  removeQuickLinkWithApiKey,
  updateQuickLink,
  updateQuickLinkWithApiKey,
} from '@/lib/notes';
import {
  normalizeResourceId,
  readBridgeApiKeyAuthFromRequest,
  rejectCookieBackedCrossOriginMutation,
  rejectCrossOriginMutation,
} from '@/lib/request-security';

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
  const token = (await getToken({ template: 'convex' })) ?? (await getToken());
  return token ?? null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;
  const id = normalizeResourceId(rawId);
  if (!id) return NextResponse.json({ error: 'Invalid quick link id' }, { status: 400 });
  let payload: { key?: unknown; targetUrl?: unknown; label?: unknown };

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const key = sanitizeKey(payload.key);
  const targetUrl = normalizeUrl(payload.targetUrl);
  const label = typeof payload.label === 'string' ? payload.label.trim() || null : null;

  if (!key) return NextResponse.json({ error: 'Quick link key is required' }, { status: 400 });
  if (!targetUrl) return NextResponse.json({ error: 'Target URL is required' }, { status: 400 });

  const token = await requireToken();
  if (token) {
    const blocked = rejectCrossOriginMutation(request);
    if (blocked) return blocked;
  }
  const apiKeyAuth = token ? null : await readBridgeApiKeyAuthFromRequest(request);
  if (!token && !apiKeyAuth) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const cookieBlocked = rejectCookieBackedCrossOriginMutation(request, apiKeyAuth);
  if (cookieBlocked) return cookieBlocked;

  try {
    const data = token
      ? await updateQuickLink({
          token,
          linkId: id,
          key,
          targetUrl,
          label,
        })
      : await updateQuickLinkWithApiKey({
          apiKey: apiKeyAuth?.apiKey as string,
          linkId: id,
          key,
          targetUrl,
          label,
        });
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update quick link';
    const status =
      message === 'Not authenticated' || message === 'Invalid API key'
        ? 401
        : message.includes('permission') || message === 'Forbidden'
          ? 403
          : message === 'Quick link not found'
            ? 404
            : message === 'Quick link key already exists'
              ? 409
              : message.startsWith('Invalid target URL')
                ? 400
                : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;
  const id = normalizeResourceId(rawId);
  if (!id) return NextResponse.json({ error: 'Invalid quick link id' }, { status: 400 });
  const token = await requireToken();
  if (token) {
    const blocked = rejectCrossOriginMutation(request);
    if (blocked) return blocked;
  }
  const apiKeyAuth = token ? null : await readBridgeApiKeyAuthFromRequest(request);
  if (!token && !apiKeyAuth) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const cookieBlocked = rejectCookieBackedCrossOriginMutation(request, apiKeyAuth);
  if (cookieBlocked) return cookieBlocked;

  try {
    const data = token
      ? await removeQuickLink({ token, linkId: id })
      : await removeQuickLinkWithApiKey({ apiKey: apiKeyAuth?.apiKey as string, linkId: id });
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to remove quick link';
    const status =
      message === 'Not authenticated' || message === 'Invalid API key'
        ? 401
        : message.includes('permission') || message === 'Forbidden'
          ? 403
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
