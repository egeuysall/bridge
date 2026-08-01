import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { adminRestoreNoteVersion, getAdminNoteVersion, listAdminNoteVersions } from '@/lib/notes';
import { isAdminUser } from '@/lib/admin';
import { normalizeResourceId, rejectCrossOriginMutation } from '@/lib/request-security';

async function requireAdmin() {
  const { userId, getToken } = await auth();
  if (!userId) return { error: 'Not authenticated' as const, token: null };

  const token = (await getToken({ template: 'convex' })) ?? (await getToken());
  if (!token) return { error: 'Not authenticated' as const, token: null };

  const user = await currentUser();
  if (!isAdminUser(user)) return { error: 'Forbidden' as const, token: null };

  const adminSecret = process.env.BRIDGE_ADMIN_SECRET?.trim() || '';
  if (!adminSecret) return { error: 'Admin secret not configured' as const, token: null };

  return { token, adminSecret };
}

function clampLimit(raw: string | null): number {
  const parsed = Number(raw ?? '50');
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(1, Math.min(100, Math.floor(parsed)));
}

function statusFromError(message: string) {
  if (message === 'Not authenticated') return 401;
  if (message === 'Forbidden') return 403;
  if (message === 'Note not found' || message === 'Version not found') return 404;
  if (message === 'Admin secret not configured') return 500;
  return 500;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.token) {
    const message = admin.error ?? 'Not authenticated';
    return NextResponse.json({ error: message }, { status: statusFromError(message) });
  }

  const { id: rawId } = await params;
  const id = normalizeResourceId(rawId);
  if (!id) return NextResponse.json({ error: 'Invalid note id' }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const versionId = searchParams.get('versionId');

  try {
    if (versionId) {
      const normalizedVersionId = normalizeResourceId(versionId);
      if (!normalizedVersionId) {
        return NextResponse.json({ error: 'Invalid version id' }, { status: 400 });
      }
      const data = await getAdminNoteVersion({
        token: admin.token,
        adminSecret: admin.adminSecret,
        noteId: id,
        versionId: normalizedVersionId,
      });
      if (!data) return NextResponse.json({ error: 'Version not found' }, { status: 404 });
      return NextResponse.json({ data });
    }

    const data = await listAdminNoteVersions({
      token: admin.token,
      adminSecret: admin.adminSecret,
      noteId: id,
      limit: clampLimit(searchParams.get('limit')),
    });
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch note versions';
    return NextResponse.json({ error: message }, { status: statusFromError(message) });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = rejectCrossOriginMutation(request);
  if (blocked) return blocked;

  const admin = await requireAdmin();
  if (!admin.token) {
    const message = admin.error ?? 'Not authenticated';
    return NextResponse.json({ error: message }, { status: statusFromError(message) });
  }

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

  try {
    const data = await adminRestoreNoteVersion({
      token: admin.token,
      adminSecret: admin.adminSecret,
      noteId: id,
      versionId,
    });
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to restore note version';
    return NextResponse.json({ error: message }, { status: statusFromError(message) });
  }
}
