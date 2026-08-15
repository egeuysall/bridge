import Link from 'next/link';
import { notFound } from 'next/navigation';
import { auth, currentUser } from '@clerk/nextjs/server';
import { headers } from 'next/headers';
import { UserDashboard } from '@/components/dashboard/user-dashboard';
import { PublicProfileAvatar } from '@/components/public-profile-avatar';
import { formatQuickLinkTitle } from '@/lib/quick-link-display';
import {
  getMyUserProfile,
  getPublicUserProfileByUsername,
  listPublicNotesByUsername,
  listQuickLinksByUsername,
} from '@/lib/notes';
import { getBridgeApiKeySessionFromRequest } from '@/lib/request-security';
import {
  isPublicUsernamePath,
  normalizePathHandle,
  resolveUserHandle,
  resolveUserHandleFromUser,
} from '@/lib/user-handle';

export const revalidate = 0;
const PUBLIC_LIST_PAGE_SIZE = 5;

function singleQueryParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function parsePage(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return parsed;
}

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { username } = await params;
  const resolvedSearchParams = await searchParams;
  const forcePublicProfile = resolvedSearchParams.public === '1';
  if (!isPublicUsernamePath(username)) notFound();

  const normalizedPathHandle = normalizePathHandle(username);
  if (!normalizedPathHandle) notFound();

  const { sessionClaims, userId, getToken } = await auth();
  let userHandle = resolveUserHandle(sessionClaims as Record<string, unknown> | null | undefined);
  let apiKeySession: Awaited<ReturnType<typeof getBridgeApiKeySessionFromRequest>> = null;

  if (!userHandle && userId) {
    const token = (await getToken({ template: 'convex' })) ?? (await getToken()) ?? null;
    if (token) {
      const profile = await getMyUserProfile({ token }).catch(() => null);
      if (profile?.username) {
        userHandle = normalizePathHandle(profile.username);
      }
    }
  }

  if (!userHandle && userId) {
    const user = await currentUser().catch(() => null);
    const fallbackHandle = resolveUserHandleFromUser(user);
    if (fallbackHandle) userHandle = fallbackHandle;
  }

  if (!userHandle) {
    const cookieHeader = (await headers()).get('cookie') ?? '';
    apiKeySession = await getBridgeApiKeySessionFromRequest(
      new Request('http://bri.local', { headers: { cookie: cookieHeader } })
    );
    if (apiKeySession?.username) userHandle = normalizePathHandle(apiKeySession.username);
  }

  if (!forcePublicProfile && userHandle && normalizedPathHandle === userHandle) {
    return <UserDashboard apiKeySession={Boolean(apiKeySession)} />;
  }

  const [profile, notes, links] = await Promise.all([
    getPublicUserProfileByUsername({ username: normalizedPathHandle }),
    listPublicNotesByUsername({ username: normalizedPathHandle }),
    listQuickLinksByUsername({ username: normalizedPathHandle }),
  ]);

  if (!profile && notes.length === 0 && links.length === 0) {
    notFound();
  }

  const sortedNotes = [...notes].sort((a, b) => b.createdAt - a.createdAt);
  const sortedLinks = [...links].sort((a, b) => b.updatedAt - a.updatedAt);
  const notePages = Math.max(1, Math.ceil(sortedNotes.length / PUBLIC_LIST_PAGE_SIZE));
  const linkPages = Math.max(1, Math.ceil(sortedLinks.length / PUBLIC_LIST_PAGE_SIZE));
  const notePage = Math.min(parsePage(singleQueryParam(resolvedSearchParams.notePage)), notePages);
  const linkPage = Math.min(parsePage(singleQueryParam(resolvedSearchParams.linkPage)), linkPages);
  const visibleNotes = sortedNotes.slice(
    (notePage - 1) * PUBLIC_LIST_PAGE_SIZE,
    notePage * PUBLIC_LIST_PAGE_SIZE
  );
  const visibleLinks = sortedLinks.slice(
    (linkPage - 1) * PUBLIC_LIST_PAGE_SIZE,
    linkPage * PUBLIC_LIST_PAGE_SIZE
  );
  const pageHref = (nextNotePage: number, nextLinkPage: number) => {
    const params = new URLSearchParams();
    if (forcePublicProfile) params.set('public', '1');
    if (nextNotePage > 1) params.set('notePage', String(nextNotePage));
    if (nextLinkPage > 1) params.set('linkPage', String(nextLinkPage));
    const query = params.toString();
    return query ? `/${normalizedPathHandle}?${query}` : `/${normalizedPathHandle}`;
  };

  return (
    <section className="w-full animate-enter px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto w-full max-w-155 space-y-8">
        <header className="flex flex-col items-start gap-3">
          <PublicProfileAvatar name={normalizedPathHandle} />
          <div className="space-y-2">
            <h1 className="text-base font-semibold text-neutral-100">
              {profile?.displayName ? `${profile.displayName} ` : ''}@{normalizedPathHandle}
            </h1>
            <p className="text-xs text-neutral-500">
              {profile?.email ? profile.email : 'email unavailable'}
            </p>
            <p className="text-xs text-neutral-500">
              {notes.length} published notes &middot; {links.length} links
            </p>
          </div>
        </header>

        <div className="space-y-3">
          <h2 className="text-xs text-neutral-500">Published notes</h2>
          {notes.length === 0 ? (
            <p className="text-xs text-neutral-500">No published notes.</p>
          ) : (
            visibleNotes.map((note) => (
              <Link
                key={note.id}
                href={`/${note.username}/${note.slug}`}
                className="block rounded-sm border border-neutral-800 px-3 py-3 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-900/85"
              >
                <p className="text-sm text-neutral-100">{note.title}</p>
                <p className="mt-1 text-[11px] text-neutral-500">
                  {new Date(note.createdAt).toLocaleDateString()}
                </p>
              </Link>
            ))
          )}
          {notePages > 1 ? (
            <div className="flex items-center gap-3 text-xs text-neutral-400">
              {notePage > 1 ? (
                <Link
                  href={pageHref(notePage - 1, linkPage)}
                  className="text-neutral-300 transition-colors hover:text-neutral-100"
                >
                  Previous
                </Link>
              ) : (
                <span className="text-neutral-600">Previous</span>
              )}
              <span>
                {notePage} / {notePages}
              </span>
              {notePage < notePages ? (
                <Link
                  href={pageHref(notePage + 1, linkPage)}
                  className="text-neutral-300 transition-colors hover:text-neutral-100"
                >
                  Next
                </Link>
              ) : (
                <span className="text-neutral-600">Next</span>
              )}
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <h2 className="text-xs text-neutral-500">Published links</h2>
          {links.length === 0 ? (
            <p className="text-xs text-neutral-500">No links yet.</p>
          ) : (
            visibleLinks.map((link) => (
              <a
                key={link.id}
                href={`/${link.username}/${link.key}`}
                className="block rounded-sm border border-neutral-800 px-3 py-3 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-900/85"
              >
                <p className="truncate text-sm text-neutral-100">
                  {formatQuickLinkTitle(link.label, link.key)}
                </p>
                <p className="mt-1 truncate text-[11px] text-neutral-500">{link.targetUrl}</p>
                <p className="mt-1 text-[11px] text-neutral-500">{link.clicks} views</p>
              </a>
            ))
          )}
          {linkPages > 1 ? (
            <div className="flex items-center gap-3 text-xs text-neutral-400">
              {linkPage > 1 ? (
                <Link
                  href={pageHref(notePage, linkPage - 1)}
                  className="text-neutral-300 transition-colors hover:text-neutral-100"
                >
                  Previous
                </Link>
              ) : (
                <span className="text-neutral-600">Previous</span>
              )}
              <span>
                {linkPage} / {linkPages}
              </span>
              {linkPage < linkPages ? (
                <Link
                  href={pageHref(notePage, linkPage + 1)}
                  className="text-neutral-300 transition-colors hover:text-neutral-100"
                >
                  Next
                </Link>
              ) : (
                <span className="text-neutral-600">Next</span>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
