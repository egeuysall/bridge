import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import {
  dismissMyNotification,
  dismissNotificationWithApiKey,
  listMyNotifications,
  listNotificationsWithApiKey,
  resolveMyNotificationTarget,
  resolveNotificationTargetWithApiKey,
} from '@/lib/notes';
import {
  normalizeResourceId,
  readBridgeApiKeyAuthFromRequest,
  rejectCookieBackedCrossOriginMutation,
  rejectCrossOriginMutation,
} from '@/lib/request-security';

async function requireToken() {
  const { userId, getToken } = await auth();
  if (!userId) return null;
  return (await getToken({ template: 'convex' })) ?? (await getToken()) ?? null;
}

export async function GET(request: Request) {
  const token = await requireToken();
  const apiKeyAuth = token ? null : await readBridgeApiKeyAuthFromRequest(request);
  if (!token && !apiKeyAuth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    const data = token
      ? await listMyNotifications({ token })
      : await listNotificationsWithApiKey({ apiKey: apiKeyAuth?.apiKey as string });
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load notifications';
    const status =
      message === 'Not authenticated' || message === 'Invalid API key'
        ? 401
        : message === 'API key lacks read permission'
          ? 403
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: Request) {
  const token = await requireToken();
  const apiKeyAuth = token ? null : await readBridgeApiKeyAuthFromRequest(request);
  if (!token && !apiKeyAuth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const blocked = rejectCrossOriginMutation(request);
  if (blocked) return blocked;
  const cookieBlocked = rejectCookieBackedCrossOriginMutation(request, apiKeyAuth);
  if (cookieBlocked) return cookieBlocked;

  let payload: { action?: unknown; notificationId?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (payload.action !== 'dismiss' && payload.action !== 'open') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const notificationId =
    typeof payload.notificationId === 'string' ? normalizeResourceId(payload.notificationId) : null;
  if (!notificationId) {
    return NextResponse.json({ error: 'Invalid notification id' }, { status: 400 });
  }

  try {
    if (payload.action === 'dismiss') {
      const data = token
        ? await dismissMyNotification({
            token,
            notificationId,
          })
        : await dismissNotificationWithApiKey({
            apiKey: apiKeyAuth?.apiKey as string,
            notificationId,
          });
      return NextResponse.json({ data });
    }

    const data = token
      ? await resolveMyNotificationTarget({
          token,
          notificationId,
        })
      : await resolveNotificationTargetWithApiKey({
          apiKey: apiKeyAuth?.apiKey as string,
          notificationId,
        });
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update notification';
    const status =
      message === 'Not authenticated' || message === 'Invalid API key'
        ? 401
        : message === 'API key lacks read permission' || message === 'API key lacks write permission'
          ? 403
        : message === 'Forbidden'
          ? 403
        : message === 'Username is required'
            ? 400
            : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
