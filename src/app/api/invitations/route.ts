import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import {
  inviteUserToNote,
  inviteUserToNoteWithApiKey,
  inviteUserToQuickLink,
  inviteUserToQuickLinkWithApiKey,
} from '@/lib/notes';
import {
  normalizeResourceId,
  readBridgeApiKeyAuthFromRequest,
  rejectCookieBackedCrossOriginMutation,
  rejectCrossOriginMutation,
} from '@/lib/request-security';

function sanitizeUsername(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

async function requireToken() {
  const { userId, getToken } = await auth();
  if (!userId) return null;
  return (await getToken({ template: 'convex' })) ?? (await getToken()) ?? null;
}

export async function POST(request: Request) {
  const token = await requireToken();
  const apiKeyAuth = token ? null : await readBridgeApiKeyAuthFromRequest(request);
  if (!token && !apiKeyAuth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const blocked = rejectCrossOriginMutation(request);
  if (blocked) return blocked;
  const cookieBlocked = rejectCookieBackedCrossOriginMutation(request, apiKeyAuth);
  if (cookieBlocked) return cookieBlocked;

  let payload: { kind?: unknown; id?: unknown; inviteeUsername?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const kind = payload.kind;
  const id = typeof payload.id === 'string' ? normalizeResourceId(payload.id) : null;
  const inviteeUsername = sanitizeUsername(payload.inviteeUsername);

  if (!id) return NextResponse.json({ error: 'Invalid resource id' }, { status: 400 });
  if (!inviteeUsername) {
    return NextResponse.json({ error: 'Invitee username is required' }, { status: 400 });
  }

  try {
    if (kind === 'note') {
      const data = token
        ? await inviteUserToNote({
            token,
            noteId: id,
            inviteeUsername,
        })
        : await inviteUserToNoteWithApiKey({
            apiKey: apiKeyAuth?.apiKey as string,
            noteId: id,
            inviteeUsername,
          });
      return NextResponse.json({ data });
    }

    if (kind === 'link') {
      const data = token
        ? await inviteUserToQuickLink({
            token,
            linkId: id,
            inviteeUsername,
        })
        : await inviteUserToQuickLinkWithApiKey({
            apiKey: apiKeyAuth?.apiKey as string,
            linkId: id,
            inviteeUsername,
          });
      return NextResponse.json({ data });
    }

    return NextResponse.json({ error: 'Invalid invitation kind' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create invitation';
    const status =
      message === 'Not authenticated'
        ? 401
        : message === 'Invalid API key'
          ? 401
          : message === 'API key lacks write permission'
            ? 403
        : message === 'Forbidden'
          ? 403
          : message === 'Note not found' || message === 'Quick link not found'
            ? 404
            : message === 'Invitee username is required' ||
                message === 'Cannot invite yourself' ||
                message === 'Cannot invite to deleted note'
              ? 400
              : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
