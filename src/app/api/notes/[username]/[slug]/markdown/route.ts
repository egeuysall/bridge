import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getNoteByUsernameAndSlug } from '@/lib/notes';
import { getMarkdownAlias } from '@/lib/post-slugs';
import { readBridgeApiKeyAuthFromRequest } from '@/lib/request-security';
import { normalizeMarkdownTables } from '@/lib/tiptap-markdown';

function getFilename(username: string, slug: string): string {
  const safe = `${username}-${getMarkdownAlias(slug)}`.replace(/[^a-zA-Z0-9._-]/g, '-');
  return safe;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ username: string; slug: string }> }
) {
  const { username, slug } = await params;
  const apiKeyAuth = await readBridgeApiKeyAuthFromRequest(request);
  const { getToken } = await auth();
  const token = (await getToken({ template: 'convex' })) ?? (await getToken()) ?? null;

  const note = await getNoteByUsernameAndSlug({
    username,
    slug,
    apiKey: apiKeyAuth?.apiKey ?? null,
    token,
  });

  if (!note) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return new Response(normalizeMarkdownTables(note.content), {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=600',
      'Content-Disposition': `inline; filename="${getFilename(note.username, note.slug)}"`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
