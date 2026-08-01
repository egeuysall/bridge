import { fetchMutation, fetchQuery } from 'convex/nextjs';
import { api } from '../../convex/_generated/api';

export type NoteVisibility = 'public' | 'private';
export type NoteState = 'active' | 'deleted';

export type NoteRecord = {
  id: string;
  username: string;
  slug: string;
  title: string;
  content: string;
  visibility: NoteVisibility;
  state: NoteState;
  createdAt: number;
  updatedAt: number;
  expiresAt: number | null;
  deletedAt: number | null;
  purgeAt: number | null;
};

export type NoteVersionMetadataRecord = {
  id: string;
  noteId: string;
  version: number;
  title: string;
  slug: string;
  visibility: NoteVisibility;
  expiresAt: number | null;
  createdAt: number;
  actor: 'owner' | 'api_key' | 'admin' | 'restore';
};

export type NoteVersionRecord = NoteVersionMetadataRecord & {
  content: string;
};

export type ApiKeyRecord = {
  id: string;
  prefix: string;
  permissions: 'read' | 'write' | 'read_write';
  label: string | null;
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
};

export type QuickLinkRecord = {
  id: string;
  username: string;
  key: string;
  targetUrl: string;
  label: string | null;
  clicks: number;
  createdAt: number;
  updatedAt: number;
  lastClickedAt: number | null;
};

export type PinnedRecord = {
  id: string;
  kind: 'note' | 'link';
  noteId: string | null;
  linkId: string | null;
  title: string;
  href: string;
  createdAt: number;
};

export type UserProfilePublicRecord = {
  username: string;
  displayName: string | null;
  email: string | null;
  createdAt: number;
  updatedAt: number;
};

export type NotificationRecord = {
  id: string;
  kind: 'invitation' | 'achievement' | 'notice';
  title: string;
  message: string;
  noteId: string | null;
  linkId: string | null;
  createdAt: number;
};

export type InviteSummaryRecord = {
  id: string;
  invitedCount: number;
  invitees: string[];
};

export async function getNoteByUsernameAndSlug(input: {
  username: string;
  slug: string;
  apiKey?: string | null;
  token?: string | null;
}): Promise<NoteRecord | null> {
  try {
    await fetchMutation(api.notes.expireDueByUsernameAndSlug, {
      username: input.username,
      slug: input.slug,
    });
  } catch {
    // Best-effort cleanup; reads should still proceed.
  }

  const data = await fetchQuery(
    api.notes.getByUsernameAndSlug,
    {
      username: input.username,
      slug: input.slug,
      apiKey: input.apiKey ?? null,
    },
    input.token ? { token: input.token } : undefined
  );
  return data ?? null;
}

export async function getAdminNoteByUsernameAndSlug(input: {
  username: string;
  slug: string;
  token: string;
  adminSecret: string;
}): Promise<NoteRecord | null> {
  const data = await fetchQuery(
    api.notes.getAdminByUsernameAndSlug,
    {
      username: input.username,
      slug: input.slug,
      adminSecret: input.adminSecret,
    },
    { token: input.token }
  );
  return data ?? null;
}

export async function expireMyDueNotes(input: { token: string }) {
  return await fetchMutation(api.notes.expireMineDue, {}, { token: input.token });
}

export async function expireDueNotesWithApiKey(input: { apiKey: string }) {
  return await fetchMutation(api.notes.expireDueByApiKey, { apiKey: input.apiKey });
}

export async function listMyNotes(input: {
  state: NoteState;
  token: string;
}): Promise<NoteRecord[]> {
  return await fetchQuery(api.notes.listMine, { state: input.state }, { token: input.token });
}

export async function listPublicNotesByUsername(input: {
  username: string;
}): Promise<NoteRecord[]> {
  return await fetchQuery(api.notes.listPublicByUsername, {
    username: input.username,
  });
}

export async function listNotesWithApiKey(input: {
  apiKey: string;
  state: NoteState;
}): Promise<NoteRecord[]> {
  return await fetchQuery(api.notes.listByApiKey, {
    apiKey: input.apiKey,
    state: input.state,
  });
}

export async function listMyNoteInviteSummaries(input: {
  token: string;
}): Promise<InviteSummaryRecord[]> {
  const rows = await fetchQuery(api.notes.listInviteSummaryMine, {}, { token: input.token });
  return rows.map((row) => ({
    id: row.noteId as string,
    invitedCount: row.invitedCount,
    invitees: row.invitees,
  }));
}

export async function listNoteInviteSummariesWithApiKey(input: {
  apiKey: string;
}): Promise<InviteSummaryRecord[]> {
  const rows = await fetchQuery(api.notes.listInviteSummaryByApiKey, { apiKey: input.apiKey });
  return rows.map((row) => ({
    id: row.noteId as string,
    invitedCount: row.invitedCount,
    invitees: row.invitees,
  }));
}

export async function createNoteWithAuth(input: {
  token: string;
  username: string;
  title: string;
  content: string;
  visibility: NoteVisibility;
  expiresInDays: number | null;
}) {
  return await fetchMutation(
    api.notes.create,
    {
      username: input.username,
      title: input.title,
      content: input.content,
      visibility: input.visibility,
      expiresInDays: input.expiresInDays,
    },
    { token: input.token }
  );
}

export async function createNoteWithApiKey(input: {
  apiKey: string;
  title: string;
  content: string;
  visibility: NoteVisibility;
  expiresInDays: number | null;
}) {
  return await fetchMutation(api.notes.createWithApiKey, {
    apiKey: input.apiKey,
    title: input.title,
    content: input.content,
    visibility: input.visibility,
    expiresInDays: input.expiresInDays,
  });
}

export async function updateNote(input: {
  token: string;
  noteId: string;
  title: string;
  content: string;
  visibility: NoteVisibility;
  expiresInDays: number | null;
}) {
  return await fetchMutation(
    api.notes.update,
    {
      noteId: input.noteId as never,
      title: input.title,
      content: input.content,
      visibility: input.visibility,
      expiresInDays: input.expiresInDays,
    },
    { token: input.token }
  );
}

export async function updateNoteWithApiKey(input: {
  apiKey: string;
  noteId: string;
  title: string;
  content: string;
  visibility: NoteVisibility;
  expiresInDays: number | null;
}) {
  return await fetchMutation(api.notes.updateWithApiKey, {
    apiKey: input.apiKey,
    noteId: input.noteId as never,
    title: input.title,
    content: input.content,
    visibility: input.visibility,
    expiresInDays: input.expiresInDays,
  });
}

export async function softDeleteNote(input: { token: string; noteId: string }) {
  return await fetchMutation(
    api.notes.softDelete,
    { noteId: input.noteId as never },
    { token: input.token }
  );
}

export async function softDeleteNoteWithApiKey(input: { apiKey: string; noteId: string }) {
  return await fetchMutation(api.notes.softDeleteWithApiKey, {
    apiKey: input.apiKey,
    noteId: input.noteId as never,
  });
}

export async function restoreNote(input: { token: string; noteId: string }) {
  return await fetchMutation(
    api.notes.restore,
    { noteId: input.noteId as never },
    { token: input.token }
  );
}

export async function listNoteVersions(input: {
  token: string;
  noteId: string;
  limit: number;
}): Promise<NoteVersionMetadataRecord[]> {
  return await fetchQuery(
    api.notes.listVersionsMine,
    { noteId: input.noteId as never, limit: input.limit },
    { token: input.token }
  );
}

export async function listNoteVersionsWithApiKey(input: {
  apiKey: string;
  noteId: string;
  limit: number;
}): Promise<NoteVersionMetadataRecord[]> {
  return await fetchQuery(api.notes.listVersionsByApiKey, {
    apiKey: input.apiKey,
    noteId: input.noteId as never,
    limit: input.limit,
  });
}

export async function getNoteVersion(input: {
  token: string;
  noteId: string;
  versionId: string;
}): Promise<NoteVersionRecord | null> {
  const data = await fetchQuery(
    api.notes.getVersionMine,
    { noteId: input.noteId as never, versionId: input.versionId as never },
    { token: input.token }
  );
  return data ?? null;
}

export async function getNoteVersionWithApiKey(input: {
  apiKey: string;
  noteId: string;
  versionId: string;
}): Promise<NoteVersionRecord | null> {
  const data = await fetchQuery(api.notes.getVersionByApiKey, {
    apiKey: input.apiKey,
    noteId: input.noteId as never,
    versionId: input.versionId as never,
  });
  return data ?? null;
}

export async function restoreNoteVersion(input: {
  token: string;
  noteId: string;
  versionId: string;
}) {
  return await fetchMutation(
    api.notes.restoreVersion,
    { noteId: input.noteId as never, versionId: input.versionId as never },
    { token: input.token }
  );
}

export async function restoreNoteVersionWithApiKey(input: {
  apiKey: string;
  noteId: string;
  versionId: string;
}) {
  return await fetchMutation(api.notes.restoreVersionByApiKey, {
    apiKey: input.apiKey,
    noteId: input.noteId as never,
    versionId: input.versionId as never,
  });
}

export async function permanentlyDeleteNote(input: { token: string; noteId: string }) {
  return await fetchMutation(
    api.notes.permanentlyDelete,
    { noteId: input.noteId as never },
    { token: input.token }
  );
}

export async function permanentlyDeleteNoteWithApiKey(input: { apiKey: string; noteId: string }) {
  return await fetchMutation(api.notes.permanentlyDeleteWithApiKey, {
    apiKey: input.apiKey,
    noteId: input.noteId as never,
  });
}

export async function adminUpdateNote(input: {
  token: string;
  noteId: string;
  adminSecret: string;
  title: string;
  content: string;
  visibility: NoteVisibility;
  expiresInDays: number | null;
}) {
  return await fetchMutation(
    api.notes.adminUpdate,
    {
      adminSecret: input.adminSecret,
      noteId: input.noteId as never,
      title: input.title,
      content: input.content,
      visibility: input.visibility,
      expiresInDays: input.expiresInDays,
    },
    { token: input.token }
  );
}

export async function listAdminNoteVersions(input: {
  token: string;
  adminSecret: string;
  noteId: string;
  limit: number;
}): Promise<NoteVersionMetadataRecord[]> {
  return await fetchQuery(
    api.notes.listVersionsAdmin,
    { adminSecret: input.adminSecret, noteId: input.noteId as never, limit: input.limit },
    { token: input.token }
  );
}

export async function getAdminNoteVersion(input: {
  token: string;
  adminSecret: string;
  noteId: string;
  versionId: string;
}): Promise<NoteVersionRecord | null> {
  const data = await fetchQuery(
    api.notes.getVersionAdmin,
    {
      adminSecret: input.adminSecret,
      noteId: input.noteId as never,
      versionId: input.versionId as never,
    },
    { token: input.token }
  );
  return data ?? null;
}

export async function adminRestoreNoteVersion(input: {
  token: string;
  adminSecret: string;
  noteId: string;
  versionId: string;
}) {
  return await fetchMutation(
    api.notes.adminRestoreVersion,
    {
      adminSecret: input.adminSecret,
      noteId: input.noteId as never,
      versionId: input.versionId as never,
    },
    { token: input.token }
  );
}

export async function trackNotePageView(input: { username: string; slug: string; path: string }) {
  return await fetchMutation(api.notes.trackPageView, {
    username: input.username,
    slug: input.slug,
    path: input.path,
  });
}

export async function getMyAnalytics(input: { token: string; days: number }) {
  return await fetchQuery(api.notes.analyticsMine, { days: input.days }, { token: input.token });
}

export async function listMyApiKeys(input: { token: string }): Promise<ApiKeyRecord[]> {
  return await fetchQuery(api.apiKeys.listMine, {}, { token: input.token });
}

export async function createApiKeyHashed(input: {
  token: string;
  username: string;
  prefix: string;
  keyHash: string;
  permissions: 'read' | 'write' | 'read_write';
  label: string | null;
}) {
  return await fetchMutation(
    api.apiKeys.createHashed,
    {
      username: input.username,
      prefix: input.prefix,
      keyHash: input.keyHash,
      permissions: input.permissions,
      label: input.label,
    },
    { token: input.token }
  );
}

export async function revokeApiKey(input: { token: string; keyId: string }) {
  return await fetchMutation(
    api.apiKeys.revokeMine,
    { keyId: input.keyId as never },
    { token: input.token }
  );
}

export async function listQuickLinks(input: { token: string }): Promise<QuickLinkRecord[]> {
  return await fetchQuery(api.quickLinks.listMine, {}, { token: input.token });
}

export async function listQuickLinksByUsername(input: {
  username: string;
}): Promise<QuickLinkRecord[]> {
  return await fetchQuery(api.quickLinks.listByUsername, { username: input.username });
}

export async function listQuickLinksWithApiKey(input: {
  apiKey: string;
}): Promise<QuickLinkRecord[]> {
  return await fetchQuery(api.quickLinks.listByApiKey, { apiKey: input.apiKey });
}

export async function listMyQuickLinkInviteSummaries(input: {
  token: string;
}): Promise<InviteSummaryRecord[]> {
  const rows = await fetchQuery(api.quickLinks.listInviteSummaryMine, {}, { token: input.token });
  return rows.map((row) => ({
    id: row.linkId as string,
    invitedCount: row.invitedCount,
    invitees: row.invitees,
  }));
}

export async function listQuickLinkInviteSummariesWithApiKey(input: {
  apiKey: string;
}): Promise<InviteSummaryRecord[]> {
  const rows = await fetchQuery(api.quickLinks.listInviteSummaryByApiKey, {
    apiKey: input.apiKey,
  });
  return rows.map((row) => ({
    id: row.linkId as string,
    invitedCount: row.invitedCount,
    invitees: row.invitees,
  }));
}

export async function createQuickLink(input: {
  token: string;
  username: string;
  key: string;
  targetUrl: string;
  label: string | null;
}) {
  return await fetchMutation(
    api.quickLinks.create,
    {
      username: input.username,
      key: input.key,
      targetUrl: input.targetUrl,
      label: input.label,
    },
    { token: input.token }
  );
}

export async function createQuickLinkWithApiKey(input: {
  apiKey: string;
  key: string;
  targetUrl: string;
  label: string | null;
}) {
  return await fetchMutation(api.quickLinks.createWithApiKey, {
    apiKey: input.apiKey,
    key: input.key,
    targetUrl: input.targetUrl,
    label: input.label,
  });
}

export async function updateQuickLink(input: {
  token: string;
  linkId: string;
  key: string;
  targetUrl: string;
  label: string | null;
}) {
  return await fetchMutation(
    api.quickLinks.update,
    {
      linkId: input.linkId as never,
      key: input.key,
      targetUrl: input.targetUrl,
      label: input.label,
    },
    { token: input.token }
  );
}

export async function updateQuickLinkWithApiKey(input: {
  apiKey: string;
  linkId: string;
  key: string;
  targetUrl: string;
  label: string | null;
}) {
  return await fetchMutation(api.quickLinks.updateWithApiKey, {
    apiKey: input.apiKey,
    linkId: input.linkId as never,
    key: input.key,
    targetUrl: input.targetUrl,
    label: input.label,
  });
}

export async function removeQuickLink(input: { token: string; linkId: string }) {
  return await fetchMutation(
    api.quickLinks.remove,
    { linkId: input.linkId as never },
    { token: input.token }
  );
}

export async function removeQuickLinkWithApiKey(input: { apiKey: string; linkId: string }) {
  return await fetchMutation(api.quickLinks.removeWithApiKey, {
    apiKey: input.apiKey,
    linkId: input.linkId as never,
  });
}

export async function getQuickLinkByUsernameAndKey(input: {
  username: string;
  key: string;
}): Promise<QuickLinkRecord | null> {
  const data = await fetchQuery(api.quickLinks.getByUsernameAndKey, {
    username: input.username,
    key: input.key,
  });
  return data ?? null;
}

export async function trackQuickLinkClick(input: { linkId: string }) {
  return await fetchMutation(api.quickLinks.trackClick, { linkId: input.linkId as never });
}

export async function inviteUserToNote(input: {
  token: string;
  noteId: string;
  inviteeUsername: string;
}) {
  return await fetchMutation(
    api.notes.inviteUser,
    {
      noteId: input.noteId as never,
      inviteeUsername: input.inviteeUsername,
    },
    { token: input.token }
  );
}

export async function inviteUserToNoteWithApiKey(input: {
  apiKey: string;
  noteId: string;
  inviteeUsername: string;
}) {
  return await fetchMutation(api.notes.inviteUserWithApiKey, {
    apiKey: input.apiKey,
    noteId: input.noteId as never,
    inviteeUsername: input.inviteeUsername,
  });
}

export async function inviteUserToQuickLink(input: {
  token: string;
  linkId: string;
  inviteeUsername: string;
}) {
  return await fetchMutation(
    api.quickLinks.inviteUser,
    {
      linkId: input.linkId as never,
      inviteeUsername: input.inviteeUsername,
    },
    { token: input.token }
  );
}

export async function inviteUserToQuickLinkWithApiKey(input: {
  apiKey: string;
  linkId: string;
  inviteeUsername: string;
}) {
  return await fetchMutation(api.quickLinks.inviteUserWithApiKey, {
    apiKey: input.apiKey,
    linkId: input.linkId as never,
    inviteeUsername: input.inviteeUsername,
  });
}

export async function listMyNotifications(input: { token: string }): Promise<{
  username: string | null;
  items: NotificationRecord[];
}> {
  return await fetchQuery(api.notifications.listMine, {}, { token: input.token });
}

export async function listNotificationsWithApiKey(input: { apiKey: string }): Promise<{
  username: string | null;
  items: NotificationRecord[];
}> {
  return await fetchQuery(api.notifications.listByApiKey, { apiKey: input.apiKey });
}

export async function dismissMyNotification(input: { token: string; notificationId: string }) {
  return await fetchMutation(
    api.notifications.dismiss,
    { notificationId: input.notificationId as never },
    { token: input.token }
  );
}

export async function dismissNotificationWithApiKey(input: {
  apiKey: string;
  notificationId: string;
}) {
  return await fetchMutation(api.notifications.dismissByApiKey, {
    apiKey: input.apiKey,
    notificationId: input.notificationId as never,
  });
}

export async function resolveMyNotificationTarget(input: {
  token: string;
  notificationId: string;
}): Promise<{ href: string | null }> {
  return await fetchQuery(
    api.notifications.resolveTarget,
    { notificationId: input.notificationId as never },
    { token: input.token }
  );
}

export async function resolveNotificationTargetWithApiKey(input: {
  apiKey: string;
  notificationId: string;
}): Promise<{ href: string | null }> {
  return await fetchQuery(api.notifications.resolveTargetByApiKey, {
    apiKey: input.apiKey,
    notificationId: input.notificationId as never,
  });
}

export async function syncMyUserProfile(input: {
  token: string;
  username: string;
  displayName: string | null;
  email: string | null;
}) {
  return await fetchMutation(
    api.userProfiles.syncMine,
    {
      username: input.username,
      displayName: input.displayName,
      email: input.email,
    },
    { token: input.token }
  );
}

export async function getPublicUserProfileByUsername(input: {
  username: string;
}): Promise<UserProfilePublicRecord | null> {
  const data = await fetchQuery(api.userProfiles.getPublicByUsername, {
    username: input.username,
  });
  return data ?? null;
}

export async function getMyUserProfile(input: {
  token: string;
}): Promise<UserProfilePublicRecord | null> {
  const data = await fetchQuery(api.userProfiles.getMine, {}, { token: input.token });
  return data ?? null;
}

export async function listPins(input: { token: string }): Promise<PinnedRecord[]> {
  return await fetchQuery(api.pins.listMine, {}, { token: input.token });
}

export async function togglePinnedNote(input: { token: string; noteId: string }) {
  return await fetchMutation(
    api.pins.toggleNote,
    { noteId: input.noteId as never },
    { token: input.token }
  );
}

export async function togglePinnedLink(input: { token: string; linkId: string }) {
  return await fetchMutation(
    api.pins.toggleLink,
    { linkId: input.linkId as never },
    { token: input.token }
  );
}
