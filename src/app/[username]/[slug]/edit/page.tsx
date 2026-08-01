import { auth, currentUser } from '@clerk/nextjs/server';
import { notFound, redirect } from 'next/navigation';
import { NoteSlugEditor } from '@/components/dashboard/note-slug-editor';
import { isAdminUser } from '@/lib/admin';
import { getAdminNoteByUsernameAndSlug, getNoteByUsernameAndSlug } from '@/lib/notes';
import { resolveUserHandleFromUser } from '@/lib/user-handle';
import { isPublicResourcePath, isPublicUsernamePath } from '@/lib/user-handle';

export default async function EditNotePage({
  params,
}: {
  params: Promise<{ username: string; slug: string }>;
}) {
  const { username, slug } = await params;
  if (!isPublicUsernamePath(username) || !isPublicResourcePath(slug)) notFound();

  const { userId, getToken } = await auth();
  if (!userId) redirect('/sign-in');

  const user = await currentUser();
  const handle = resolveUserHandleFromUser(user);
  const isAdmin = isAdminUser(user);
  if (handle !== username && !isAdmin) notFound();

  const token = (await getToken({ template: 'convex' })) ?? (await getToken()) ?? null;
  if (!token) redirect('/sign-in');

  const adminSecret = process.env.BRIDGE_ADMIN_SECRET?.trim() || '';
  const note =
    isAdmin && adminSecret
      ? await getAdminNoteByUsernameAndSlug({ username, slug, token, adminSecret })
      : await getNoteByUsernameAndSlug({ username, slug, token });

  if (!note || (!isAdmin && note.username !== handle)) notFound();

  return <NoteSlugEditor note={note} isAdmin={isAdmin} />;
}
