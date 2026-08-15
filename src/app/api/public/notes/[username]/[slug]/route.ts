import { NextResponse } from 'next/server';
import { getNoteByUsernameAndSlug } from '@/lib/notes';
import { readBridgeApiKeyAuthFromRequest } from '@/lib/request-security';
import { normalizeMarkdownTables } from '@/lib/tiptap-markdown';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ username: string; slug: string }> }
) {
  const { username, slug } = await params;
  const apiKeyAuth = await readBridgeApiKeyAuthFromRequest(request);

  try {
    const note = await getNoteByUsernameAndSlug({
      username,
      slug,
      apiKey: apiKeyAuth?.apiKey ?? null,
    });
    if (!note) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({
      data: {
        username: note.username,
        slug: note.slug,
        title: note.title,
        content: normalizeMarkdownTables(note.content),
        visibility: note.visibility,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch note' }, { status: 500 });
  }
}
