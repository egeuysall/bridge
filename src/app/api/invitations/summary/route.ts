import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import {
  listMyNoteInviteSummaries,
  listMyQuickLinkInviteSummaries,
  listNoteInviteSummariesWithApiKey,
  listQuickLinkInviteSummariesWithApiKey,
} from '@/lib/notes';
import { readBridgeApiKeyAuthFromRequest } from '@/lib/request-security';

async function requireToken() {
  try {
    const { userId, getToken } = await auth();
    if (!userId) return null;
    return (await getToken({ template: 'convex' })) ?? (await getToken()) ?? null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const token = await requireToken();
  const apiKeyAuth = token ? null : await readBridgeApiKeyAuthFromRequest(request);
  if (!token && !apiKeyAuth) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const [notes, links] = token
      ? await Promise.all([
          listMyNoteInviteSummaries({ token }),
          listMyQuickLinkInviteSummaries({ token }),
        ])
      : await Promise.all([
          listNoteInviteSummariesWithApiKey({ apiKey: apiKeyAuth?.apiKey as string }),
          listQuickLinkInviteSummariesWithApiKey({ apiKey: apiKeyAuth?.apiKey as string }),
        ]);

    return NextResponse.json({ data: { notes, links } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load invitation summary';
    const status =
      message === 'Not authenticated' || message === 'Invalid API key'
        ? 401
        : message === 'API key lacks read permission'
          ? 403
          : 500;
    if (status === 500) {
      return NextResponse.json({
        data: { notes: [], links: [] },
        warning: message,
      });
    }
    return NextResponse.json({ error: message }, { status });
  }
}
