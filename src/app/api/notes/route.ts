import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import {
  createNoteWithApiKey,
  createNoteWithAuth,
  expireDueNotesWithApiKey,
  expireMyDueNotes,
  listMyNotes,
  listNotesWithApiKey,
  type NoteVisibility,
} from '@/lib/notes';
import {
  readBridgeApiKeyAuthFromRequest,
  rejectCookieBackedCrossOriginMutation,
  rejectCrossOriginMutation,
} from '@/lib/request-security';
import { normalizeMarkdownTables } from '@/lib/tiptap-markdown';
import { resolveUserHandleFromUser } from '@/lib/user-handle';

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

function normalizeVisibility(value: unknown): NoteVisibility {
  return value === 'private' ? 'private' : 'public';
}

function normalizeExpiresInDays(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== 'number') return 30;
  if (!Number.isFinite(value) || value <= 0) return 30;
  return Math.min(30, value);
}

function normalizeTitle(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, 120);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') === 'deleted' ? 'deleted' : 'active';

  const { userId, getToken } = await auth();
  if (userId) {
    const token = await getToken({ template: 'convex' });
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
      if (state === 'active') {
        await expireMyDueNotes({ token }).catch(() => undefined);
      }
      const notes = await listMyNotes({ state, token });
      return NextResponse.json({ data: notes });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch notes';
      return NextResponse.json({ error: message }, { status: statusFromErrorMessage(message) });
    }
  }

  const apiKeyAuth = await readBridgeApiKeyAuthFromRequest(request);
  if (!apiKeyAuth) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    if (state === 'active') {
      await expireDueNotesWithApiKey({ apiKey: apiKeyAuth.apiKey }).catch(() => undefined);
    }
    const notes = await listNotesWithApiKey({ state, apiKey: apiKeyAuth.apiKey });
    return NextResponse.json({ data: notes });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch notes';
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
  let payload: {
    title?: unknown;
    content?: unknown;
    visibility?: unknown;
    expiresInDays?: unknown;
  };

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const title = normalizeTitle(payload.title);
  const content =
    typeof payload.content === 'string' ? normalizeMarkdownTables(payload.content) : '';
  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }
  if (!content.trim()) {
    return NextResponse.json({ error: 'Content cannot be empty' }, { status: 400 });
  }

  const visibility = normalizeVisibility(payload.visibility);
  const expiresInDays = normalizeExpiresInDays(payload.expiresInDays);

  const { userId, getToken } = await auth();
  if (userId) {
    const blocked = rejectCrossOriginMutation(request);
    if (blocked) return blocked;

    const token = (await getToken({ template: 'convex' })) ?? (await getToken());
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const user = await currentUser();
    const username = resolveUserHandleFromUser(user);
    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    try {
      const result = await createNoteWithAuth({
        token,
        username,
        title,
        content,
        visibility,
        expiresInDays,
      });
      return NextResponse.json({ data: result }, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create note';
      const status =
        message === 'Not authenticated'
          ? 401
          : message === 'Username is required' ||
              message === 'Title is required' ||
              message === 'Content cannot be empty'
            ? 400
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
    const result = await createNoteWithApiKey({
      apiKey: apiKeyAuth.apiKey,
      title,
      content,
      visibility,
      expiresInDays,
    });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create note';
    const status =
      message === 'Invalid API key'
        ? 401
        : message === 'API key lacks write permission'
          ? 403
          : message === 'Title is required' || message === 'Content cannot be empty'
            ? 400
            : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
