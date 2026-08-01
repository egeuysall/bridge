import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { adminUpdateNote, type NoteVisibility } from '@/lib/notes';
import { isAdminUser } from '@/lib/admin';
import { normalizeResourceId, rejectCrossOriginMutation } from '@/lib/request-security';

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

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId, getToken } = await auth();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const token = (await getToken({ template: 'convex' })) ?? (await getToken());
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const blocked = rejectCrossOriginMutation(request);
  if (blocked) return blocked;

  const user = await currentUser();
  if (!isAdminUser(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const adminSecret = process.env.BRIDGE_ADMIN_SECRET?.trim() || '';
  if (!adminSecret) {
    return NextResponse.json({ error: 'Admin secret not configured' }, { status: 500 });
  }

  const { id: rawId } = await params;
  const id = normalizeResourceId(rawId);
  if (!id) return NextResponse.json({ error: 'Invalid note id' }, { status: 400 });

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
  const content = typeof payload.content === 'string' ? payload.content : '';
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  if (!content.trim()) {
    return NextResponse.json({ error: 'Content cannot be empty' }, { status: 400 });
  }

  const visibility = normalizeVisibility(payload.visibility);
  const expiresInDays = normalizeExpiresInDays(payload.expiresInDays);

  try {
    const data = await adminUpdateNote({
      token,
      noteId: id,
      adminSecret,
      title,
      content,
      visibility,
      expiresInDays,
    });
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update note';
    const status =
      message === 'Forbidden'
        ? 403
        : message === 'Note not found'
          ? 404
          : message === 'Title is required' || message === 'Content cannot be empty'
            ? 400
            : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
