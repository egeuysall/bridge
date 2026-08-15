import type { CSSProperties } from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth, currentUser } from '@clerk/nextjs/server';
import { NoteAiOverlay } from '@/components/ai/note-ai-overlay';
import { MarkdownContent } from '@/components/markdown';
import { ExportPdfButton } from '@/components/notes/export-pdf-button';
import { isAdminUser } from '@/lib/admin';
import { geist } from '@/lib/fonts';
import {
  getAdminNoteByUsernameAndSlug,
  getNoteByUsernameAndSlug,
  getQuickLinkByUsernameAndKey,
  trackNotePageView,
  trackQuickLinkClick,
} from '@/lib/notes';
import { getBridgeApiKeySessionFromRequest } from '@/lib/request-security';
import {
  isPublicResourcePath,
  isPublicUsernamePath,
  resolveUserHandleFromUser,
} from '@/lib/user-handle';

function normalizeHeading(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim();
}

function stripLeadingHeading(content: string, title: string): string {
  const lines = content.split('\n');
  const firstLine = lines[0]?.trim() ?? '';
  // Remove only duplicated first-level heading that matches note title.
  if (!firstLine.startsWith('# ')) {
    return content;
  }

  const headingText = firstLine.replace(/^#\s+/, '');
  if (normalizeHeading(headingText) !== normalizeHeading(title)) {
    return content;
  }
  return lines.slice(1).join('\n').trimStart();
}

function formatDate(value: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export default async function NotePage({
  params,
}: {
  params: Promise<{ username: string; slug: string }>;
}) {
  const { username, slug } = await params;
  if (!isPublicUsernamePath(username) || !isPublicResourcePath(slug)) notFound();

  const { getToken } = await auth();
  const token = (await getToken({ template: 'convex' })) ?? (await getToken()) ?? null;
  const user = await currentUser();
  const cookieHeader = (await headers()).get('cookie') ?? '';
  const apiKeySession = await getBridgeApiKeySessionFromRequest(
    new Request('http://bri.local', { headers: { cookie: cookieHeader } })
  );
  const isAdmin = isAdminUser(user);
  const canEdit =
    resolveUserHandleFromUser(user) === username || apiKeySession?.username === username || isAdmin;
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

  if (!note) {
    const quickLink = await getQuickLinkByUsernameAndKey({ username, key: slug });
    if (!quickLink) {
      notFound();
    }
    await trackQuickLinkClick({ linkId: quickLink.id });
    redirect(quickLink.targetUrl);
  }

  await trackNotePageView({
    username: note.username,
    slug: note.slug,
    path: `/${note.username}/${note.slug}`,
  });

  const contentWithoutHeading = stripLeadingHeading(note.content, note.title);

  return (
    <>
      <section
        className={`${geist.variable} w-full animate-enter px-4 py-5 md:px-8 md:py-8`}
        style={{ '--delay': '40ms' } as CSSProperties}
        data-note-export-root
      >
        <article className="mx-auto w-full max-w-155">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-base font-semibold text-neutral-100" data-note-export-title>
              {note.title}
            </h1>
            <div className="flex shrink-0 items-center gap-2" data-note-export-actions>
              <ExportPdfButton title={note.title} />
              {canEdit ? (
                <Link
                  href={`/${note.username}/${note.slug}/edit`}
                  className="shrink-0 rounded-sm border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-xs font-medium text-neutral-100 transition-colors hover:bg-neutral-900"
                >
                  edit page
                </Link>
              ) : null}
            </div>
          </div>
          <p className="mt-2 text-xs text-neutral-400" data-note-export-meta>
            <Link href={`/${note.username}`} className="transition-colors hover:text-neutral-100">
              @{note.username}
            </Link>{' '}
            &middot; {formatDate(note.createdAt)}
          </p>

          <div className="px-0 py-6 md:py-7" data-note-export-content>
            <div className="prose prose-neutral prose-invert max-w-none prose-p:text-neutral-300 prose-headings:text-neutral-100 prose-h1:text-[1rem]! prose-h1:leading-6! prose-h1:font-semibold! prose-h2:text-[0.95rem]! prose-h2:leading-6! prose-h2:font-medium! prose-h3:text-[0.88rem]! prose-h3:leading-6! prose-h3:font-medium! prose-h4:text-[0.82rem]! prose-h4:leading-5! prose-h4:font-medium! prose-strong:text-neutral-100 prose-a:text-neutral-100 prose-a:decoration-neutral-700 prose-hr:border-neutral-800 prose-pre:border prose-pre:border-neutral-800">
              <MarkdownContent postId={note.id} content={contentWithoutHeading} />
            </div>
          </div>
        </article>
      </section>
      <NoteAiOverlay username={note.username} slug={note.slug} title={note.title} />
    </>
  );
}
