import { auth, currentUser } from '@clerk/nextjs/server';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { NoteSlugEditor } from '@/components/dashboard/note-slug-editor';
import { isAdminUser } from '@/lib/admin';
import { getAdminNoteByUsernameAndSlug, getNoteByUsernameAndSlug } from '@/lib/notes';
import { getBridgeApiKeySessionFromRequest } from '@/lib/request-security';
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
  const cookieHeader = (await headers()).get('cookie') ?? '';
  const apiKeySession = await getBridgeApiKeySessionFromRequest(
    new Request('http://bri.local', { headers: { cookie: cookieHeader } })
  );
  if (!userId && !apiKeySession) redirect('/sign-in');

  const user = await currentUser();
  const handle = resolveUserHandleFromUser(user);
  const isAdmin = isAdminUser(user);
  if (handle !== username && apiKeySession?.username !== username && !isAdmin) notFound();

  const token = (await getToken({ template: 'convex' })) ?? (await getToken()) ?? null;
  if (!token && !apiKeySession) redirect('/sign-in');

  const adminSecret = process.env.BRIDGE_ADMIN_SECRET?.trim() || '';
  const note =
    isAdmin && token && adminSecret
      ? await getAdminNoteByUsernameAndSlug({ username, slug, token, adminSecret })
      : await getNoteByUsernameAndSlug({
          username,
          slug,
          token,
          apiKey: apiKeySession?.apiKey ?? null,
        });

  if (!note || (!isAdmin && note.username !== (handle ?? apiKeySession?.username))) notFound();

  return <NoteSlugEditor note={note} isAdmin={isAdmin} />;
}
