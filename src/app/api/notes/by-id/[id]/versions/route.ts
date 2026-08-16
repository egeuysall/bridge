import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import {
  getNoteVersion,
  getNoteVersionWithApiKey,
  listNoteVersions,
  listNoteVersionsWithApiKey,
  restoreNoteVersion,
  restoreNoteVersionWithApiKey,
} from '@/lib/notes';
import {
  type BridgeApiKeyAuth,
  normalizeResourceId,
  hasBridgeApiKeyAuthorization,
  readBridgeApiKeyAuthFromRequest,
  rejectCookieBackedCrossOriginMutation,
  rejectCrossOriginMutation,
  verifyBridgeApiKey,
} from '@/lib/request-security';

async function requireConvexToken() {
  const { userId, getToken } = await auth();
  if (!userId) return null;
  const token = (await getToken({ template: 'convex' })) ?? (await getToken());
  return token ?? null;
}

function clampLimit(raw: string | null): number {
  const parsed = Number(raw ?? '50');
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(1, Math.min(100, Math.floor(parsed)));
}

function errorResponse(message: string, fallback: string) {
  if (message.includes('Not authenticated') || message.includes('Invalid API key')) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }
  if (message.includes('permission') || message.includes('Forbidden')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (message.includes('Note not found') || message.includes('Version not found')) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 });
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
}

async function rejectInvalidBearerApiKey(
  apiKeyAuth: BridgeApiKeyAuth | null
): Promise<NextResponse | null> {
  if (apiKeyAuth?.source !== 'bearer') return null;

  try {
    if (await verifyBridgeApiKey(apiKeyAuth.apiKey)) return null;
  } catch {
    return NextResponse.json({ error: 'API key verification unavailable' }, { status: 503 });
  }

  return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = normalizeResourceId(rawId);
  if (!id) return NextResponse.json({ error: 'Invalid note id' }, { status: 400 });

  const apiKeyAuth = await readBridgeApiKeyAuthFromRequest(request);
  if (!apiKeyAuth && hasBridgeApiKeyAuthorization(request)) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }
  const invalidApiKey = await rejectInvalidBearerApiKey(apiKeyAuth);
  if (invalidApiKey) return invalidApiKey;
  const token = apiKeyAuth ? null : await requireConvexToken();
  if (!token && !apiKeyAuth) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const versionId = searchParams.get('versionId');

  try {
    if (versionId) {
      const normalizedVersionId = normalizeResourceId(versionId);
      if (!normalizedVersionId) {
        return NextResponse.json({ error: 'Invalid version id' }, { status: 400 });
      }
      const data = token
        ? await getNoteVersion({ token, noteId: id, versionId: normalizedVersionId })
        : await getNoteVersionWithApiKey({
            apiKey: apiKeyAuth?.apiKey as string,
            noteId: id,
            versionId: normalizedVersionId,
          });
      if (!data) return NextResponse.json({ error: 'Version not found' }, { status: 404 });
      return NextResponse.json({ data });
    }

    const limit = clampLimit(searchParams.get('limit'));
    const data = token
      ? await listNoteVersions({ token, noteId: id, limit })
      : await listNoteVersionsWithApiKey({
          apiKey: apiKeyAuth?.apiKey as string,
          noteId: id,
          limit,
        });
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch note versions';
    return errorResponse(message, 'Failed to fetch note versions');
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = rejectCrossOriginMutation(request);
  if (blocked) return blocked;

  const { id: rawId } = await params;
  const id = normalizeResourceId(rawId);
  if (!id) return NextResponse.json({ error: 'Invalid note id' }, { status: 400 });

  let payload: { action?: unknown; versionId?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (payload.action !== 'restore') {
    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  }
  if (typeof payload.versionId !== 'string') {
    return NextResponse.json({ error: 'Invalid version id' }, { status: 400 });
  }
  const versionId = normalizeResourceId(payload.versionId);
  if (!versionId) return NextResponse.json({ error: 'Invalid version id' }, { status: 400 });

  const apiKeyAuth = await readBridgeApiKeyAuthFromRequest(request);
  if (!apiKeyAuth && hasBridgeApiKeyAuthorization(request)) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }
  const invalidApiKey = await rejectInvalidBearerApiKey(apiKeyAuth);
  if (invalidApiKey) return invalidApiKey;
  const token = apiKeyAuth ? null : await requireConvexToken();
  if (!token && !apiKeyAuth) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const cookieBlocked = rejectCookieBackedCrossOriginMutation(request, apiKeyAuth);
  if (cookieBlocked) return cookieBlocked;

  try {
    const data = token
      ? await restoreNoteVersion({ token, noteId: id, versionId })
      : await restoreNoteVersionWithApiKey({
          apiKey: apiKeyAuth?.apiKey as string,
          noteId: id,
          versionId,
        });
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to restore note version';
    return errorResponse(message, 'Failed to restore note version');
  }
}
