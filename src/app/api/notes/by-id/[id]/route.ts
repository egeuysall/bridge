import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import {
  permanentlyDeleteNote,
  permanentlyDeleteNoteWithApiKey,
  restoreNote,
  softDeleteNote,
  softDeleteNoteWithApiKey,
  updateNote,
  updateNoteWithApiKey,
  type NoteVisibility,
} from '@/lib/notes';
import {
  normalizeResourceId,
  readBridgeApiKeyAuthFromRequest,
  rejectCookieBackedCrossOriginMutation,
  rejectCrossOriginMutation,
} from '@/lib/request-security';
import { normalizeMarkdownTables } from '@/lib/tiptap-markdown';

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

async function requireConvexToken() {
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
  if (!id) {
    return NextResponse.json({ error: 'Invalid note id' }, { status: 400 });
  }
  let payload: {
    action?: unknown;
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

  const action = typeof payload.action === 'string' ? payload.action : 'update';
  const token = await requireConvexToken();
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
    if (action === 'softDelete') {
      const data = token
        ? await softDeleteNote({ token, noteId: id })
        : await softDeleteNoteWithApiKey({ apiKey: apiKeyAuth?.apiKey as string, noteId: id });
      return NextResponse.json({ data });
    }

    if (action === 'restore') {
      if (!token) {
        return NextResponse.json({ error: 'Restore requires user session' }, { status: 403 });
      }
      const data = await restoreNote({ token, noteId: id });
      return NextResponse.json({ data });
    }

    if (action === 'permanentDelete') {
      const data = token
        ? await permanentlyDeleteNote({ token, noteId: id })
        : await permanentlyDeleteNoteWithApiKey({
            apiKey: apiKeyAuth?.apiKey as string,
            noteId: id,
          });
      return NextResponse.json({ data });
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

    const data = token
      ? await updateNote({
          token,
          noteId: id,
          title,
          content,
          visibility,
          expiresInDays,
        })
      : await updateNoteWithApiKey({
          apiKey: apiKeyAuth?.apiKey as string,
          noteId: id,
          title,
          content,
          visibility,
          expiresInDays,
        });

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update note';
    const status =
      message === 'Not authenticated' || message === 'Invalid API key'
        ? 401
        : message.includes('permission') || message === 'Forbidden'
          ? 403
          : message === 'Title is required' || message === 'Content cannot be empty'
            ? 400
            : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
