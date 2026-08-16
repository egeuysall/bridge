import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { isMarkdownAlias, stripMarkdownAlias } from '@/lib/post-slugs';
import { resolveUserHandle } from '@/lib/user-handle';

function hasBridgeApiKeyAuthorization(request: Request): boolean {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
  return /^Bearer\s+bri_/i.test(authHeader?.trim() ?? '');
}

export default clerkMiddleware(async (auth, request) => {
  const { pathname } = request.nextUrl;
  const userHandle = hasBridgeApiKeyAuthorization(request)
    ? null
    : resolveUserHandle(
        ((await auth()).sessionClaims as Record<string, unknown> | null | undefined)
      );

  if (pathname === '/' && userHandle) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = `/${userHandle}`;
    return NextResponse.redirect(redirectUrl);
  }

  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 2) {
    const [username, maybeMarkdownSlug] = segments;
    if (username && maybeMarkdownSlug && isMarkdownAlias(maybeMarkdownSlug)) {
      const normalizedSlug = stripMarkdownAlias(maybeMarkdownSlug).trim();
      if (!normalizedSlug) return NextResponse.next();

      const rewriteUrl = request.nextUrl.clone();
      rewriteUrl.pathname = `/api/notes/${encodeURIComponent(username)}/${encodeURIComponent(normalizedSlug)}/markdown`;
      return NextResponse.rewrite(rewriteUrl);
    }
  }

  if (segments.length === 1) {
    const [slug] = segments;
    if (slug && isMarkdownAlias(slug)) {
      const normalizedSlug = stripMarkdownAlias(slug).trim();
      if (!normalizedSlug) return NextResponse.next();

      const rewriteUrl = request.nextUrl.clone();
      rewriteUrl.pathname = `/api/posts/${encodeURIComponent(normalizedSlug)}/markdown`;
      return NextResponse.rewrite(rewriteUrl);
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
