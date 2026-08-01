import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { selectPublicProfile } from "./userProfilesModel";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_NOTE_VERSIONS = 100;

type Permission = "read" | "write" | "read_write";
type NeededPermission = "read" | "write";
type VersionActor = "owner" | "api_key" | "admin" | "restore";
type ConvexCtx = QueryCtx | MutationCtx;

function sanitizeUsername(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
}

function sanitizeTitle(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 120);
}

function readIdentityString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function usernameFromEmail(email: string | null): string | null {
  if (!email) return null;
  const [localPart] = email.split("@");
  if (!localPart) return null;
  const cleaned = sanitizeUsername(localPart);
  return cleaned.length > 0 ? cleaned : null;
}

function resolveUsernameFromIdentity(identity: Record<string, unknown>): string | null {
  const raw =
    readIdentityString(identity.username) ??
    readIdentityString(identity.preferred_username) ??
    readIdentityString(identity.nickname) ??
    readIdentityString(identity.handle) ??
    readIdentityString(identity.user_handle) ??
    usernameFromEmail(readIdentityString(identity.email));
  if (!raw) return null;
  const cleaned = sanitizeUsername(raw);
  return cleaned.length > 0 ? cleaned : null;
}

function cleanDisplayName(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value.trim().replace(/\s+/g, " ").slice(0, 120);
  return cleaned.length > 0 ? cleaned : null;
}

function cleanEmail(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value.trim().toLowerCase().slice(0, 200);
  if (!cleaned.includes("@")) return null;
  return cleaned;
}

function slugify(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[`"'.,!?()[\]{}]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || "note";
}

function hasPermission(permission: Permission, needed: NeededPermission): boolean {
  if (permission === "read_write") return true;
  return permission === needed;
}

function parseApiKey(rawApiKey: string): { prefix: string } | null {
  const normalized = rawApiKey.trim();
  const separatorIndex = normalized.indexOf(".");

  if (separatorIndex <= 0) return null;

  const prefix = normalized.slice(0, separatorIndex);
  if (!prefix.startsWith("bri_")) return null;

  return { prefix };
}

function sanitizePath(path: string): string {
  const cleaned = path.trim().replace(/\s+/g, " ");
  if (!cleaned.startsWith("/")) return "/";
  return cleaned.slice(0, 300);
}

function dayKeyFromEpoch(epochMs: number): string {
  const date = new Date(epochMs);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const digestBytes = new Uint8Array(digest);
  return Array.from(digestBytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function resolveApiKey(ctx: ConvexCtx, rawApiKey: string) {
  const parsed = parseApiKey(rawApiKey);
  if (!parsed) return null;

  const keyRecord = await ctx.db
    .query("apiKeys")
    .withIndex("by_prefix", (q) => q.eq("prefix", parsed.prefix))
    .unique();

  if (!keyRecord || keyRecord.revokedAt !== null) return null;

  const computedHash = await sha256Hex(rawApiKey);
  if (computedHash !== keyRecord.keyHash) return null;

  return keyRecord as Doc<"apiKeys">;
}

async function resolveUniqueSlug(
  ctx: MutationCtx,
  ownerTokenIdentifier: string,
  baseSlug: string,
  skipNoteId?: Id<"notes">
): Promise<string> {
  let candidate = baseSlug;
  let counter = 2;

  while (true) {
    const existing = await ctx.db
      .query("notes")
      .withIndex("by_ownerTokenIdentifier_and_slug", (q) =>
        q.eq("ownerTokenIdentifier", ownerTokenIdentifier).eq("slug", candidate)
      )
      .unique();

    if (!existing || (skipNoteId && existing._id === skipNoteId)) {
      return candidate;
    }

    candidate = `${baseSlug}-${counter}`;
    counter += 1;
  }
}

async function upsertUserProfile(
  ctx: MutationCtx,
  identity: { tokenIdentifier: string } & Record<string, unknown>,
  username: string
) {
  const displayName = cleanDisplayName(readIdentityString(identity.name));
  const email = cleanEmail(readIdentityString(identity.email));
  const now = Date.now();

  const profiles = await ctx.db
    .query("userProfiles")
    .withIndex("by_ownerTokenIdentifier", (q) =>
      q.eq("ownerTokenIdentifier", identity.tokenIdentifier)
    )
    .take(5);
  const existing = selectPublicProfile(profiles);

  if (existing) {
    await ctx.db.patch(existing._id, {
      username,
      displayName,
      email,
      updatedAt: now,
    });
    return;
  }

  await ctx.db.insert("userProfiles", {
    ownerTokenIdentifier: identity.tokenIdentifier,
    username,
    displayName,
    email,
    createdAt: now,
    updatedAt: now,
  });
}

async function resolveViewerUsername(
  ctx: ConvexCtx,
  identity: { tokenIdentifier: string } & Record<string, unknown>
) {
  const profiles = await ctx.db
    .query("userProfiles")
    .withIndex("by_ownerTokenIdentifier", (q) =>
      q.eq("ownerTokenIdentifier", identity.tokenIdentifier)
    )
    .take(5);
  const profile = selectPublicProfile(profiles);

  if (profile?.username) return profile.username;
  return resolveUsernameFromIdentity(identity);
}

function mapNote(note: Doc<"notes">) {
  return {
    id: note._id,
    username: note.username,
    slug: note.slug,
    title: note.title,
    content: note.content,
    visibility: note.visibility,
    state: note.state,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    expiresAt: note.expiresAt,
    deletedAt: note.deletedAt,
    purgeAt: note.purgeAt,
  };
}

function mapNoteVersionMetadata(version: Doc<"noteVersions">) {
  return {
    id: version._id,
    noteId: version.noteId,
    version: version.version,
    title: version.title,
    slug: version.slug,
    visibility: version.visibility,
    expiresAt: version.expiresAt,
    createdAt: version.createdAt,
    actor: version.actor,
  };
}

function mapNoteVersion(version: Doc<"noteVersions">) {
  return { ...mapNoteVersionMetadata(version), content: version.content };
}

function validateNoteInput(input: { username: string; title: string; content: string }) {
  const username = sanitizeUsername(input.username);
  const title = sanitizeTitle(input.title);
  const content = input.content.trim();

  if (!username) throw new Error("Username is required");
  if (!title) throw new Error("Title is required");
  if (!content) throw new Error("Content cannot be empty");

  return { username, title, content };
}

async function markDeleted(ctx: MutationCtx, note: Doc<"notes">, now: number) {
  const purgeAt = now + THIRTY_DAYS_MS;
  await ctx.db.patch(note._id, {
    state: "deleted",
    deletedAt: now,
    purgeAt,
    updatedAt: now,
  });
  await ctx.scheduler.runAt(purgeAt, internal.notes.purgeDeletedNote, {
    noteId: note._id,
    expectedPurgeAt: purgeAt,
  });
}

async function insertNoteSnapshot(
  ctx: MutationCtx,
  note: Doc<"notes">,
  actor: VersionActor,
  now: number
) {
  const latest = await ctx.db
    .query("noteVersions")
    .withIndex("by_noteId_and_version", (q) => q.eq("noteId", note._id))
    .order("desc")
    .take(1);
  const version = (latest[0]?.version ?? 0) + 1;

  await ctx.db.insert("noteVersions", {
    noteId: note._id,
    ownerTokenIdentifier: note.ownerTokenIdentifier,
    version,
    title: note.title,
    slug: note.slug,
    content: note.content,
    visibility: note.visibility,
    expiresAt: note.expiresAt,
    createdAt: now,
    actor,
  });

  const versions = await ctx.db
    .query("noteVersions")
    .withIndex("by_noteId_and_version", (q) => q.eq("noteId", note._id))
    .order("desc")
    .take(MAX_NOTE_VERSIONS + 1);
  const oldest = versions[MAX_NOTE_VERSIONS];
  if (oldest) await ctx.db.delete(oldest._id);
}

async function deleteNoteVersionBatch(ctx: MutationCtx, noteId: Id<"notes">) {
  const versions = await ctx.db
    .query("noteVersions")
    .withIndex("by_noteId_and_version", (q) => q.eq("noteId", noteId))
    .take(MAX_NOTE_VERSIONS);

  for (const version of versions) {
    await ctx.db.delete(version._id);
  }

  return versions.length;
}

async function requireActiveNoteForVersionRead(ctx: ConvexCtx, noteId: Id<"notes">) {
  const note = await ctx.db.get(noteId);
  if (!note || note.state !== "active" || isPastExpiration(note, Date.now())) return null;
  return note;
}

function readServerEnv(name: string): string {
  return (
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[
      name
    ]?.trim() || ""
  );
}

function assertAdminAccess(identity: Record<string, unknown>, adminSecret: string) {
  const configuredSecret = readServerEnv("BRIDGE_ADMIN_SECRET");
  if (!configuredSecret || adminSecret !== configuredSecret) {
    throw new Error("Forbidden");
  }

  const admins = new Set(
    readServerEnv("BRIDGE_ADMIN_USERS")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
  const email = cleanEmail(readIdentityString(identity.email));
  if (admins.size === 0 || !admins.has(email ?? "")) {
    throw new Error("Forbidden");
  }
}

function isPastExpiration(note: Pick<Doc<"notes">, "expiresAt">, now: number): boolean {
  return typeof note.expiresAt === "number" && note.expiresAt <= now;
}

async function markDeletedIfExpired(ctx: MutationCtx, note: Doc<"notes">, now: number) {
  if (note.state !== "active") return false;
  if (!isPastExpiration(note, now)) return false;
  await markDeleted(ctx, note, now);
  return true;
}

export const listMine = query({
  args: {
    state: v.union(v.literal("active"), v.literal("deleted")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const ownerTokenIdentifier = identity.tokenIdentifier;
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_ownerTokenIdentifier_and_state_and_createdAt", (q) =>
        q.eq("ownerTokenIdentifier", ownerTokenIdentifier).eq("state", args.state)
      )
      .order("desc")
      .take(200);

    if (args.state === "active") {
      const now = Date.now();
      return notes.filter((note) => !isPastExpiration(note, now)).map(mapNote);
    }

    return notes.map(mapNote);
  },
});

export const listInviteSummaryMine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const activeNotes = await ctx.db
      .query("notes")
      .withIndex("by_ownerTokenIdentifier_and_state_and_createdAt", (q) =>
        q.eq("ownerTokenIdentifier", identity.tokenIdentifier).eq("state", "active")
      )
      .order("desc")
      .take(200);
    const deletedNotes = await ctx.db
      .query("notes")
      .withIndex("by_ownerTokenIdentifier_and_state_and_createdAt", (q) =>
        q.eq("ownerTokenIdentifier", identity.tokenIdentifier).eq("state", "deleted")
      )
      .order("desc")
      .take(200);

    const allNotes = [...activeNotes, ...deletedNotes];
    const rows: Array<{ noteId: Id<"notes">; invitedCount: number; invitees: string[] }> = [];
    for (const note of allNotes) {
      const invites = await ctx.db
        .query("noteInvites")
        .withIndex("by_noteId_and_inviteeUsername", (q) => q.eq("noteId", note._id))
        .take(200);
      const invitees = invites.map((invite) => invite.inviteeUsername);
      rows.push({
        noteId: note._id,
        invitedCount: invitees.length,
        invitees,
      });
    }

    return rows;
  },
});

export const listInviteSummaryByApiKey = query({
  args: {
    apiKey: v.string(),
  },
  handler: async (ctx, args) => {
    const keyRecord = await resolveApiKey(ctx, args.apiKey);
    if (!keyRecord) throw new Error("Invalid API key");
    if (!hasPermission(keyRecord.permissions, "read")) {
      throw new Error("API key lacks read permission");
    }

    const activeNotes = await ctx.db
      .query("notes")
      .withIndex("by_ownerTokenIdentifier_and_state_and_createdAt", (q) =>
        q.eq("ownerTokenIdentifier", keyRecord.ownerTokenIdentifier).eq("state", "active")
      )
      .order("desc")
      .take(200);
    const deletedNotes = await ctx.db
      .query("notes")
      .withIndex("by_ownerTokenIdentifier_and_state_and_createdAt", (q) =>
        q.eq("ownerTokenIdentifier", keyRecord.ownerTokenIdentifier).eq("state", "deleted")
      )
      .order("desc")
      .take(200);

    const allNotes = [...activeNotes, ...deletedNotes];
    const rows: Array<{ noteId: Id<"notes">; invitedCount: number; invitees: string[] }> = [];
    for (const note of allNotes) {
      const invites = await ctx.db
        .query("noteInvites")
        .withIndex("by_noteId_and_inviteeUsername", (q) => q.eq("noteId", note._id))
        .take(200);
      const invitees = invites.map((invite) => invite.inviteeUsername);
      rows.push({
        noteId: note._id,
        invitedCount: invitees.length,
        invitees,
      });
    }

    return rows;
  },
});

export const listPublicByUsername = query({
  args: {
    username: v.string(),
  },
  handler: async (ctx, args) => {
    const username = sanitizeUsername(args.username);
    if (!username) return [];
    const now = Date.now();

    const rows = await ctx.db
      .query("notes")
      .withIndex("by_username_and_slug", (q) => q.eq("username", username))
      .order("desc")
      .take(500);

    return rows
      .filter(
        (row) =>
          row.state === "active" && row.visibility === "public" && !isPastExpiration(row, now)
      )
      .slice(0, 100)
      .map(mapNote);
  },
});

export const listByApiKey = query({
  args: {
    apiKey: v.string(),
    state: v.union(v.literal("active"), v.literal("deleted")),
  },
  handler: async (ctx, args) => {
    const keyRecord = await resolveApiKey(ctx, args.apiKey);
    if (!keyRecord) throw new Error("Invalid API key");
    if (!hasPermission(keyRecord.permissions, "read")) {
      throw new Error("API key lacks read permission");
    }

    const notes = await ctx.db
      .query("notes")
      .withIndex("by_ownerTokenIdentifier_and_state_and_createdAt", (q) =>
        q.eq("ownerTokenIdentifier", keyRecord.ownerTokenIdentifier).eq("state", args.state)
      )
      .order("desc")
      .take(200);

    if (args.state === "active") {
      const now = Date.now();
      return notes.filter((note) => !isPastExpiration(note, now)).map(mapNote);
    }

    return notes.map(mapNote);
  },
});

export const getMineById = query({
  args: { noteId: v.id("notes") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const note = await ctx.db.get(args.noteId);
    if (!note) return null;
    if (note.ownerTokenIdentifier !== identity.tokenIdentifier) return null;
    if (note.state === "active" && isPastExpiration(note, Date.now())) return null;

    return mapNote(note);
  },
});

export const getAdminByUsernameAndSlug = query({
  args: {
    adminSecret: v.string(),
    username: v.string(),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    assertAdminAccess(identity as Record<string, unknown>, args.adminSecret);

    const username = sanitizeUsername(args.username);
    const slug = slugify(args.slug);
    if (!username || !slug) return null;

    const note = await ctx.db
      .query("notes")
      .withIndex("by_username_and_slug", (q) => q.eq("username", username).eq("slug", slug))
      .unique();
    if (!note || note.state !== "active" || isPastExpiration(note, Date.now())) return null;

    return mapNote(note);
  },
});

export const getByUsernameAndSlug = query({
  args: {
    username: v.string(),
    slug: v.string(),
    apiKey: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const username = sanitizeUsername(args.username);
    const slug = slugify(args.slug);

    if (!username || !slug) return null;

    const note = await ctx.db
      .query("notes")
      .withIndex("by_username_and_slug", (q) => q.eq("username", username).eq("slug", slug))
      .unique();

    const now = Date.now();
    if (!note || note.state !== "active" || isPastExpiration(note, now)) return null;

    if (note.visibility === "public") return mapNote(note);

    const identity = await ctx.auth.getUserIdentity();
    if (identity) {
      if (identity.tokenIdentifier === note.ownerTokenIdentifier) {
        return mapNote(note);
      }

      const viewerUsername = await resolveViewerUsername(
        ctx,
        identity as { tokenIdentifier: string } & Record<string, unknown>
      );
      if (viewerUsername) {
        const invite = await ctx.db
          .query("noteInvites")
          .withIndex("by_noteId_and_inviteeUsername", (q) =>
            q.eq("noteId", note._id).eq("inviteeUsername", viewerUsername)
          )
          .unique();
        if (invite) {
          return mapNote(note);
        }
      }
    }

    if (!args.apiKey) return null;
    const keyRecord = await resolveApiKey(ctx, args.apiKey);
    if (!keyRecord) return null;
    if (!hasPermission(keyRecord.permissions, "read")) return null;
    if (keyRecord.ownerTokenIdentifier !== note.ownerTokenIdentifier) return null;

    return mapNote(note);
  },
});

export const create = mutation({
  args: {
    username: v.string(),
    title: v.string(),
    content: v.string(),
    visibility: v.union(v.literal("public"), v.literal("private")),
    expiresInDays: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const ownerTokenIdentifier = identity.tokenIdentifier;
    const { username, title, content } = validateNoteInput(args);
    await upsertUserProfile(
      ctx,
      identity as { tokenIdentifier: string } & Record<string, unknown>,
      username
    );
    const baseSlug = slugify(title);
    const uniqueSlug = await resolveUniqueSlug(ctx, ownerTokenIdentifier, baseSlug);
    const now = Date.now();

    const expiresInDays = args.expiresInDays ?? null;
    const expiresAt =
      typeof expiresInDays === "number" && expiresInDays > 0
        ? now + Math.floor(expiresInDays * 24 * 60 * 60 * 1000)
        : null;

    const noteId = await ctx.db.insert("notes", {
      ownerTokenIdentifier,
      username,
      title,
      slug: uniqueSlug,
      content,
      visibility: args.visibility,
      state: "active",
      createdAt: now,
      updatedAt: now,
      expiresAt,
      deletedAt: null,
      purgeAt: null,
    });

    if (expiresAt !== null) {
      await ctx.scheduler.runAt(expiresAt, internal.notes.expireNote, {
        noteId,
        expectedExpiresAt: expiresAt,
      });
    }

    return {
      id: noteId,
      username,
      slug: uniqueSlug,
      title,
    };
  },
});

export const inviteUser = mutation({
  args: {
    noteId: v.id("notes"),
    inviteeUsername: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const note = await ctx.db.get(args.noteId);
    if (!note) throw new Error("Note not found");
    if (note.ownerTokenIdentifier !== identity.tokenIdentifier) throw new Error("Forbidden");
    if (note.state !== "active") throw new Error("Cannot invite to deleted note");
    const now = Date.now();
    if (await markDeletedIfExpired(ctx, note, now))
      throw new Error("Cannot invite to deleted note");

    const inviteeUsername = sanitizeUsername(args.inviteeUsername);
    if (!inviteeUsername) throw new Error("Invitee username is required");
    if (inviteeUsername === note.username) throw new Error("Cannot invite yourself");

    const existingInvite = await ctx.db
      .query("noteInvites")
      .withIndex("by_noteId_and_inviteeUsername", (q) =>
        q.eq("noteId", note._id).eq("inviteeUsername", inviteeUsername)
      )
      .unique();
    if (existingInvite) return { invited: true, alreadyInvited: true };

    await ctx.db.insert("noteInvites", {
      ownerTokenIdentifier: identity.tokenIdentifier,
      noteId: note._id,
      inviteeUsername,
      createdAt: now,
    });

    await ctx.db.insert("userNotifications", {
      recipientUsername: inviteeUsername,
      kind: "invitation",
      title: "Note invitation",
      message: `@${note.username} shared private note "${note.title}"`,
      noteId: note._id,
      linkId: null,
      createdAt: now,
      dismissedAt: null,
    });

    return { invited: true, alreadyInvited: false };
  },
});

export const inviteUserWithApiKey = mutation({
  args: {
    apiKey: v.string(),
    noteId: v.id("notes"),
    inviteeUsername: v.string(),
  },
  handler: async (ctx, args) => {
    const keyRecord = await resolveApiKey(ctx, args.apiKey);
    if (!keyRecord) throw new Error("Invalid API key");
    if (!hasPermission(keyRecord.permissions, "write")) {
      throw new Error("API key lacks write permission");
    }

    const note = await ctx.db.get(args.noteId);
    if (!note) throw new Error("Note not found");
    if (note.ownerTokenIdentifier !== keyRecord.ownerTokenIdentifier) throw new Error("Forbidden");
    if (note.state !== "active") throw new Error("Cannot invite to deleted note");
    const now = Date.now();
    if (await markDeletedIfExpired(ctx, note, now))
      throw new Error("Cannot invite to deleted note");

    const inviteeUsername = sanitizeUsername(args.inviteeUsername);
    if (!inviteeUsername) throw new Error("Invitee username is required");
    if (inviteeUsername === note.username) throw new Error("Cannot invite yourself");

    const existingInvite = await ctx.db
      .query("noteInvites")
      .withIndex("by_noteId_and_inviteeUsername", (q) =>
        q.eq("noteId", note._id).eq("inviteeUsername", inviteeUsername)
      )
      .unique();
    if (existingInvite) return { invited: true, alreadyInvited: true };

    await ctx.db.insert("noteInvites", {
      ownerTokenIdentifier: keyRecord.ownerTokenIdentifier,
      noteId: note._id,
      inviteeUsername,
      createdAt: now,
    });

    await ctx.db.insert("userNotifications", {
      recipientUsername: inviteeUsername,
      kind: "invitation",
      title: "Note invitation",
      message: `@${note.username} shared private note "${note.title}"`,
      noteId: note._id,
      linkId: null,
      createdAt: now,
      dismissedAt: null,
    });

    await ctx.db.patch(keyRecord._id, { lastUsedAt: now });
    return { invited: true, alreadyInvited: false };
  },
});

export const createWithApiKey = mutation({
  args: {
    apiKey: v.string(),
    title: v.string(),
    content: v.string(),
    visibility: v.union(v.literal("public"), v.literal("private")),
    expiresInDays: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const keyRecord = await resolveApiKey(ctx, args.apiKey);
    if (!keyRecord) throw new Error("Invalid API key");
    if (!hasPermission(keyRecord.permissions, "write")) {
      throw new Error("API key lacks write permission");
    }

    const title = sanitizeTitle(args.title);
    const content = args.content.trim();
    if (!title) throw new Error("Title is required");
    if (!content) throw new Error("Content cannot be empty");

    const baseSlug = slugify(title);
    const uniqueSlug = await resolveUniqueSlug(ctx, keyRecord.ownerTokenIdentifier, baseSlug);
    const now = Date.now();

    const expiresInDays = args.expiresInDays ?? null;
    const expiresAt =
      typeof expiresInDays === "number" && expiresInDays > 0
        ? now + Math.floor(expiresInDays * 24 * 60 * 60 * 1000)
        : null;

    const noteId = await ctx.db.insert("notes", {
      ownerTokenIdentifier: keyRecord.ownerTokenIdentifier,
      username: keyRecord.username,
      title,
      slug: uniqueSlug,
      content,
      visibility: args.visibility,
      state: "active",
      createdAt: now,
      updatedAt: now,
      expiresAt,
      deletedAt: null,
      purgeAt: null,
    });

    await ctx.db.patch(keyRecord._id, { lastUsedAt: now });

    if (expiresAt !== null) {
      await ctx.scheduler.runAt(expiresAt, internal.notes.expireNote, {
        noteId,
        expectedExpiresAt: expiresAt,
      });
    }

    return {
      id: noteId,
      username: keyRecord.username,
      slug: uniqueSlug,
      title,
    };
  },
});

export const update = mutation({
  args: {
    noteId: v.id("notes"),
    title: v.string(),
    content: v.string(),
    visibility: v.union(v.literal("public"), v.literal("private")),
    expiresInDays: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const note = await ctx.db.get(args.noteId);
    if (!note) throw new Error("Note not found");
    if (note.ownerTokenIdentifier !== identity.tokenIdentifier) throw new Error("Forbidden");
    if (note.state !== "active") throw new Error("Cannot edit deleted note");
    if (await markDeletedIfExpired(ctx, note, Date.now()))
      throw new Error("Cannot edit deleted note");

    const title = sanitizeTitle(args.title);
    const content = args.content.trim();
    if (!title) throw new Error("Title is required");
    if (!content) throw new Error("Content cannot be empty");

    const baseSlug = slugify(title);
    const uniqueSlug = await resolveUniqueSlug(ctx, identity.tokenIdentifier, baseSlug, note._id);
    const now = Date.now();
    const expiresInDays = args.expiresInDays ?? null;
    const expiresAt =
      typeof expiresInDays === "number" && expiresInDays > 0
        ? now + Math.floor(expiresInDays * 24 * 60 * 60 * 1000)
        : null;

    await insertNoteSnapshot(ctx, note, "owner", now);
    await ctx.db.patch(note._id, {
      title,
      slug: uniqueSlug,
      content,
      visibility: args.visibility,
      expiresAt,
      updatedAt: now,
    });

    if (expiresAt !== null) {
      await ctx.scheduler.runAt(expiresAt, internal.notes.expireNote, {
        noteId: note._id,
        expectedExpiresAt: expiresAt,
      });
    }

    return { id: note._id, slug: uniqueSlug, title };
  },
});

export const updateWithApiKey = mutation({
  args: {
    apiKey: v.string(),
    noteId: v.id("notes"),
    title: v.string(),
    content: v.string(),
    visibility: v.union(v.literal("public"), v.literal("private")),
    expiresInDays: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const keyRecord = await resolveApiKey(ctx, args.apiKey);
    if (!keyRecord) throw new Error("Invalid API key");
    if (!hasPermission(keyRecord.permissions, "write")) {
      throw new Error("API key lacks write permission");
    }

    const note = await ctx.db.get(args.noteId);
    if (!note) throw new Error("Note not found");
    if (note.ownerTokenIdentifier !== keyRecord.ownerTokenIdentifier) throw new Error("Forbidden");
    if (note.state !== "active") throw new Error("Cannot edit deleted note");
    if (await markDeletedIfExpired(ctx, note, Date.now()))
      throw new Error("Cannot edit deleted note");

    const title = sanitizeTitle(args.title);
    const content = args.content.trim();
    if (!title) throw new Error("Title is required");
    if (!content) throw new Error("Content cannot be empty");

    const baseSlug = slugify(title);
    const uniqueSlug = await resolveUniqueSlug(
      ctx,
      keyRecord.ownerTokenIdentifier,
      baseSlug,
      note._id
    );
    const now = Date.now();
    const expiresInDays = args.expiresInDays ?? null;
    const expiresAt =
      typeof expiresInDays === "number" && expiresInDays > 0
        ? now + Math.floor(expiresInDays * 24 * 60 * 60 * 1000)
        : null;

    await insertNoteSnapshot(ctx, note, "api_key", now);
    await ctx.db.patch(note._id, {
      title,
      slug: uniqueSlug,
      content,
      visibility: args.visibility,
      expiresAt,
      updatedAt: now,
    });

    await ctx.db.patch(keyRecord._id, { lastUsedAt: now });

    if (expiresAt !== null) {
      await ctx.scheduler.runAt(expiresAt, internal.notes.expireNote, {
        noteId: note._id,
        expectedExpiresAt: expiresAt,
      });
    }

    return { id: note._id, slug: uniqueSlug, title };
  },
});

export const softDelete = mutation({
  args: { noteId: v.id("notes") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const note = await ctx.db.get(args.noteId);
    if (!note) throw new Error("Note not found");
    if (note.ownerTokenIdentifier !== identity.tokenIdentifier) throw new Error("Forbidden");
    if (note.state === "deleted") return { deleted: true };

    await markDeleted(ctx, note, Date.now());
    return { deleted: true };
  },
});

export const softDeleteWithApiKey = mutation({
  args: { apiKey: v.string(), noteId: v.id("notes") },
  handler: async (ctx, args) => {
    const keyRecord = await resolveApiKey(ctx, args.apiKey);
    if (!keyRecord) throw new Error("Invalid API key");
    if (!hasPermission(keyRecord.permissions, "write")) {
      throw new Error("API key lacks write permission");
    }

    const note = await ctx.db.get(args.noteId);
    if (!note) throw new Error("Note not found");
    if (note.ownerTokenIdentifier !== keyRecord.ownerTokenIdentifier) throw new Error("Forbidden");
    if (note.state === "deleted") return { deleted: true };

    await markDeleted(ctx, note, Date.now());
    await ctx.db.patch(keyRecord._id, { lastUsedAt: Date.now() });
    return { deleted: true };
  },
});

export const restore = mutation({
  args: { noteId: v.id("notes") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const note = await ctx.db.get(args.noteId);
    if (!note) throw new Error("Note not found");
    if (note.ownerTokenIdentifier !== identity.tokenIdentifier) throw new Error("Forbidden");

    const now = Date.now();
    const expiresAt =
      typeof note.expiresAt === "number" && note.expiresAt > now ? note.expiresAt : null;

    if (note.state === "active") {
      if (note.expiresAt === expiresAt) return { restored: true };

      await ctx.db.patch(note._id, {
        expiresAt,
        updatedAt: now,
      });

      return { restored: true };
    }

    await ctx.db.patch(note._id, {
      state: "active",
      deletedAt: null,
      purgeAt: null,
      expiresAt,
      updatedAt: now,
    });

    return { restored: true };
  },
});

export const permanentlyDelete = mutation({
  args: { noteId: v.id("notes") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const note = await ctx.db.get(args.noteId);
    if (!note) return { deleted: true };
    if (note.ownerTokenIdentifier !== identity.tokenIdentifier) throw new Error("Forbidden");

    await ctx.db.delete(note._id);
    const deletedCount = await deleteNoteVersionBatch(ctx, note._id);
    if (deletedCount === 100) {
      await ctx.scheduler.runAfter(0, internal.notes.purgeNoteVersions, { noteId: note._id });
    }
    return { deleted: true };
  },
});

export const permanentlyDeleteWithApiKey = mutation({
  args: { apiKey: v.string(), noteId: v.id("notes") },
  handler: async (ctx, args) => {
    const keyRecord = await resolveApiKey(ctx, args.apiKey);
    if (!keyRecord) throw new Error("Invalid API key");
    if (!hasPermission(keyRecord.permissions, "write")) {
      throw new Error("API key lacks write permission");
    }

    const note = await ctx.db.get(args.noteId);
    if (!note) return { deleted: true };
    if (note.ownerTokenIdentifier !== keyRecord.ownerTokenIdentifier) throw new Error("Forbidden");

    await ctx.db.delete(note._id);
    const deletedCount = await deleteNoteVersionBatch(ctx, note._id);
    if (deletedCount === 100) {
      await ctx.scheduler.runAfter(0, internal.notes.purgeNoteVersions, { noteId: note._id });
    }
    await ctx.db.patch(keyRecord._id, { lastUsedAt: Date.now() });
    return { deleted: true };
  },
});

export const adminUpdate = mutation({
  args: {
    adminSecret: v.string(),
    noteId: v.id("notes"),
    title: v.string(),
    content: v.string(),
    visibility: v.union(v.literal("public"), v.literal("private")),
    expiresInDays: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    assertAdminAccess(identity as Record<string, unknown>, args.adminSecret);

    const note = await ctx.db.get(args.noteId);
    if (!note) throw new Error("Note not found");
    if (await markDeletedIfExpired(ctx, note, Date.now()))
      throw new Error("Cannot edit deleted note");

    const title = sanitizeTitle(args.title);
    const content = args.content.trim();
    if (!title) throw new Error("Title is required");
    if (!content) throw new Error("Content cannot be empty");

    const baseSlug = slugify(title);
    const uniqueSlug = await resolveUniqueSlug(ctx, note.ownerTokenIdentifier, baseSlug, note._id);
    const now = Date.now();
    const expiresInDays = args.expiresInDays ?? null;
    const expiresAt =
      typeof expiresInDays === "number" && expiresInDays > 0
        ? now + Math.floor(expiresInDays * 24 * 60 * 60 * 1000)
        : null;

    await insertNoteSnapshot(ctx, note, "admin", now);
    await ctx.db.patch(note._id, {
      title,
      slug: uniqueSlug,
      content,
      visibility: args.visibility,
      expiresAt,
      updatedAt: now,
    });

    if (expiresAt !== null) {
      await ctx.scheduler.runAt(expiresAt, internal.notes.expireNote, {
        noteId: note._id,
        expectedExpiresAt: expiresAt,
      });
    }

    return { id: note._id, slug: uniqueSlug, title };
  },
});

export const listVersionsMine = query({
  args: { noteId: v.id("notes"), limit: v.number() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const note = await requireActiveNoteForVersionRead(ctx, args.noteId);
    if (!note) throw new Error("Note not found");
    if (note.ownerTokenIdentifier !== identity.tokenIdentifier) throw new Error("Forbidden");

    const limit = Math.max(1, Math.min(100, Math.floor(args.limit)));
    const versions = await ctx.db
      .query("noteVersions")
      .withIndex("by_noteId_and_version", (q) => q.eq("noteId", note._id))
      .order("desc")
      .take(limit);
    return versions.map(mapNoteVersionMetadata);
  },
});

export const listVersionsByApiKey = query({
  args: { apiKey: v.string(), noteId: v.id("notes"), limit: v.number() },
  handler: async (ctx, args) => {
    const keyRecord = await resolveApiKey(ctx, args.apiKey);
    if (!keyRecord) throw new Error("Invalid API key");
    if (!hasPermission(keyRecord.permissions, "read")) {
      throw new Error("API key lacks read permission");
    }

    const note = await requireActiveNoteForVersionRead(ctx, args.noteId);
    if (!note) throw new Error("Note not found");
    if (note.ownerTokenIdentifier !== keyRecord.ownerTokenIdentifier) throw new Error("Forbidden");

    const limit = Math.max(1, Math.min(100, Math.floor(args.limit)));
    const versions = await ctx.db
      .query("noteVersions")
      .withIndex("by_noteId_and_version", (q) => q.eq("noteId", note._id))
      .order("desc")
      .take(limit);
    return versions.map(mapNoteVersionMetadata);
  },
});

export const getVersionMine = query({
  args: { noteId: v.id("notes"), versionId: v.id("noteVersions") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const note = await requireActiveNoteForVersionRead(ctx, args.noteId);
    if (!note) throw new Error("Note not found");
    if (note.ownerTokenIdentifier !== identity.tokenIdentifier) throw new Error("Forbidden");

    const version = await ctx.db.get(args.versionId);
    if (!version || version.noteId !== note._id) return null;
    return mapNoteVersion(version);
  },
});

export const getVersionByApiKey = query({
  args: { apiKey: v.string(), noteId: v.id("notes"), versionId: v.id("noteVersions") },
  handler: async (ctx, args) => {
    const keyRecord = await resolveApiKey(ctx, args.apiKey);
    if (!keyRecord) throw new Error("Invalid API key");
    if (!hasPermission(keyRecord.permissions, "read")) {
      throw new Error("API key lacks read permission");
    }

    const note = await requireActiveNoteForVersionRead(ctx, args.noteId);
    if (!note) throw new Error("Note not found");
    if (note.ownerTokenIdentifier !== keyRecord.ownerTokenIdentifier) throw new Error("Forbidden");

    const version = await ctx.db.get(args.versionId);
    if (!version || version.noteId !== note._id) return null;
    return mapNoteVersion(version);
  },
});

export const listVersionsAdmin = query({
  args: { adminSecret: v.string(), noteId: v.id("notes"), limit: v.number() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    assertAdminAccess(identity as Record<string, unknown>, args.adminSecret);

    const note = await requireActiveNoteForVersionRead(ctx, args.noteId);
    if (!note) throw new Error("Note not found");

    const limit = Math.max(1, Math.min(100, Math.floor(args.limit)));
    const versions = await ctx.db
      .query("noteVersions")
      .withIndex("by_noteId_and_version", (q) => q.eq("noteId", note._id))
      .order("desc")
      .take(limit);
    return versions.map(mapNoteVersionMetadata);
  },
});

export const getVersionAdmin = query({
  args: { adminSecret: v.string(), noteId: v.id("notes"), versionId: v.id("noteVersions") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    assertAdminAccess(identity as Record<string, unknown>, args.adminSecret);

    const note = await requireActiveNoteForVersionRead(ctx, args.noteId);
    if (!note) throw new Error("Note not found");

    const version = await ctx.db.get(args.versionId);
    if (!version || version.noteId !== note._id) return null;
    return mapNoteVersion(version);
  },
});

export const restoreVersion = mutation({
  args: { noteId: v.id("notes"), versionId: v.id("noteVersions") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const note = await ctx.db.get(args.noteId);
    if (!note) throw new Error("Note not found");
    if (note.ownerTokenIdentifier !== identity.tokenIdentifier) throw new Error("Forbidden");
    if (note.state !== "active") throw new Error("Cannot edit deleted note");
    if (await markDeletedIfExpired(ctx, note, Date.now()))
      throw new Error("Cannot edit deleted note");

    const version = await ctx.db.get(args.versionId);
    if (!version || version.noteId !== note._id) throw new Error("Version not found");

    const now = Date.now();
    const uniqueSlug = await resolveUniqueSlug(
      ctx,
      identity.tokenIdentifier,
      version.slug,
      note._id
    );
    const restoredExpiresAt = version.expiresAt;
    await insertNoteSnapshot(ctx, note, "restore", now);
    await ctx.db.patch(note._id, {
      title: version.title,
      slug: uniqueSlug,
      content: version.content,
      visibility: version.visibility,
      expiresAt: restoredExpiresAt,
      updatedAt: now,
    });

    if (restoredExpiresAt !== null) {
      await ctx.scheduler.runAfter(
        Math.max(0, restoredExpiresAt - now),
        internal.notes.expireNote,
        {
          noteId: note._id,
          expectedExpiresAt: restoredExpiresAt,
        }
      );
    }

    return { restored: true, id: note._id, slug: uniqueSlug, title: version.title };
  },
});

export const restoreVersionByApiKey = mutation({
  args: { apiKey: v.string(), noteId: v.id("notes"), versionId: v.id("noteVersions") },
  handler: async (ctx, args) => {
    const keyRecord = await resolveApiKey(ctx, args.apiKey);
    if (!keyRecord) throw new Error("Invalid API key");
    if (!hasPermission(keyRecord.permissions, "write")) {
      throw new Error("API key lacks write permission");
    }

    const note = await ctx.db.get(args.noteId);
    if (!note) throw new Error("Note not found");
    if (note.ownerTokenIdentifier !== keyRecord.ownerTokenIdentifier) throw new Error("Forbidden");
    if (note.state !== "active") throw new Error("Cannot edit deleted note");
    if (await markDeletedIfExpired(ctx, note, Date.now()))
      throw new Error("Cannot edit deleted note");

    const version = await ctx.db.get(args.versionId);
    if (!version || version.noteId !== note._id) throw new Error("Version not found");

    const now = Date.now();
    const uniqueSlug = await resolveUniqueSlug(
      ctx,
      keyRecord.ownerTokenIdentifier,
      version.slug,
      note._id
    );
    const restoredExpiresAt = version.expiresAt;
    await insertNoteSnapshot(ctx, note, "restore", now);
    await ctx.db.patch(note._id, {
      title: version.title,
      slug: uniqueSlug,
      content: version.content,
      visibility: version.visibility,
      expiresAt: restoredExpiresAt,
      updatedAt: now,
    });
    await ctx.db.patch(keyRecord._id, { lastUsedAt: now });

    if (restoredExpiresAt !== null) {
      await ctx.scheduler.runAfter(
        Math.max(0, restoredExpiresAt - now),
        internal.notes.expireNote,
        {
          noteId: note._id,
          expectedExpiresAt: restoredExpiresAt,
        }
      );
    }

    return { restored: true, id: note._id, slug: uniqueSlug, title: version.title };
  },
});

export const adminRestoreVersion = mutation({
  args: { adminSecret: v.string(), noteId: v.id("notes"), versionId: v.id("noteVersions") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    assertAdminAccess(identity as Record<string, unknown>, args.adminSecret);

    const note = await ctx.db.get(args.noteId);
    if (!note) throw new Error("Note not found");
    if (note.state !== "active") throw new Error("Cannot edit deleted note");
    if (await markDeletedIfExpired(ctx, note, Date.now()))
      throw new Error("Cannot edit deleted note");

    const version = await ctx.db.get(args.versionId);
    if (!version || version.noteId !== note._id) throw new Error("Version not found");

    const now = Date.now();
    const uniqueSlug = await resolveUniqueSlug(
      ctx,
      note.ownerTokenIdentifier,
      version.slug,
      note._id
    );
    const restoredExpiresAt = version.expiresAt;
    await insertNoteSnapshot(ctx, note, "restore", now);
    await ctx.db.patch(note._id, {
      title: version.title,
      slug: uniqueSlug,
      content: version.content,
      visibility: version.visibility,
      expiresAt: restoredExpiresAt,
      updatedAt: now,
    });

    if (restoredExpiresAt !== null) {
      await ctx.scheduler.runAfter(
        Math.max(0, restoredExpiresAt - now),
        internal.notes.expireNote,
        {
          noteId: note._id,
          expectedExpiresAt: restoredExpiresAt,
        }
      );
    }

    return { restored: true, id: note._id, slug: uniqueSlug, title: version.title };
  },
});

export const trackPageView = mutation({
  args: {
    username: v.string(),
    slug: v.string(),
    path: v.string(),
  },
  handler: async (ctx, args) => {
    const username = sanitizeUsername(args.username);
    const slug = slugify(args.slug);
    const path = sanitizePath(args.path);
    if (!username || !slug) return { tracked: false };

    const note = await ctx.db
      .query("notes")
      .withIndex("by_username_and_slug", (q) => q.eq("username", username).eq("slug", slug))
      .unique();

    const now = Date.now();
    if (!note || note.state !== "active") return { tracked: false };
    if (await markDeletedIfExpired(ctx, note, now)) return { tracked: false };

    const dayKey = dayKeyFromEpoch(now);

    const metric = await ctx.db
      .query("pageMetrics")
      .withIndex("by_ownerTokenIdentifier_and_slug_and_dayKey", (q) =>
        q
          .eq("ownerTokenIdentifier", note.ownerTokenIdentifier)
          .eq("slug", note.slug)
          .eq("dayKey", dayKey)
      )
      .unique();

    if (!metric) {
      await ctx.db.insert("pageMetrics", {
        ownerTokenIdentifier: note.ownerTokenIdentifier,
        username: note.username,
        slug: note.slug,
        path,
        dayKey,
        views: 1,
        lastViewedAt: now,
      });
      return { tracked: true };
    }

    await ctx.db.patch(metric._id, {
      views: metric.views + 1,
      lastViewedAt: now,
      path,
    });
    return { tracked: true };
  },
});

export const analyticsMine = query({
  args: {
    days: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const days = Math.max(1, Math.min(90, Math.floor(args.days)));
    const now = Date.now();
    const since = now - days * 24 * 60 * 60 * 1000;
    const sinceKey = dayKeyFromEpoch(since);
    const untilKey = dayKeyFromEpoch(now);

    const rows = await ctx.db
      .query("pageMetrics")
      .withIndex("by_ownerTokenIdentifier_and_dayKey", (q) =>
        q
          .eq("ownerTokenIdentifier", identity.tokenIdentifier)
          .gte("dayKey", sinceKey)
          .lte("dayKey", untilKey)
      )
      .take(2000);

    const bySlug: Record<string, number> = {};
    const pageViewsByDay: Record<string, number> = {};
    const linkClicksByDay: Record<string, number> = {};
    let totalViews = 0;
    let totalPageViews = 0;
    let totalLinkClicks = 0;

    for (const row of rows) {
      totalViews += row.views;
      const isQuickLinkMetric = row.slug.startsWith("ql__");
      if (isQuickLinkMetric) {
        totalLinkClicks += row.views;
        linkClicksByDay[row.dayKey] = (linkClicksByDay[row.dayKey] ?? 0) + row.views;
        continue;
      }

      totalPageViews += row.views;
      bySlug[row.slug] = (bySlug[row.slug] ?? 0) + row.views;
      pageViewsByDay[row.dayKey] = (pageViewsByDay[row.dayKey] ?? 0) + row.views;
    }

    const topPages = Object.entries(bySlug)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([slug, views]) => ({ slug, views }));

    const daily = Array.from({ length: days }).map((_, offset) => {
      const epoch = now - (days - 1 - offset) * 24 * 60 * 60 * 1000;
      const date = dayKeyFromEpoch(epoch);
      return {
        date,
        views: (pageViewsByDay[date] ?? 0) + (linkClicksByDay[date] ?? 0),
        pageViews: pageViewsByDay[date] ?? 0,
        linkClicks: linkClicksByDay[date] ?? 0,
      };
    });

    return {
      totalViews,
      totalPageViews,
      totalLinkClicks,
      days,
      viewsBySlug: bySlug,
      topPages,
      daily,
    };
  },
});

export const expireMineDue = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const notes = await ctx.db
      .query("notes")
      .withIndex("by_ownerTokenIdentifier_and_state_and_createdAt", (q) =>
        q.eq("ownerTokenIdentifier", identity.tokenIdentifier).eq("state", "active")
      )
      .order("desc")
      .take(200);

    const now = Date.now();
    let expiredCount = 0;
    for (const note of notes) {
      if (await markDeletedIfExpired(ctx, note, now)) {
        expiredCount += 1;
      }
    }

    return { expiredCount };
  },
});

export const expireDueByApiKey = mutation({
  args: {
    apiKey: v.string(),
  },
  handler: async (ctx, args) => {
    const keyRecord = await resolveApiKey(ctx, args.apiKey);
    if (!keyRecord) throw new Error("Invalid API key");
    if (!hasPermission(keyRecord.permissions, "read")) {
      throw new Error("API key lacks read permission");
    }

    const notes = await ctx.db
      .query("notes")
      .withIndex("by_ownerTokenIdentifier_and_state_and_createdAt", (q) =>
        q.eq("ownerTokenIdentifier", keyRecord.ownerTokenIdentifier).eq("state", "active")
      )
      .order("desc")
      .take(200);

    const now = Date.now();
    let expiredCount = 0;
    for (const note of notes) {
      if (await markDeletedIfExpired(ctx, note, now)) {
        expiredCount += 1;
      }
    }

    return { expiredCount };
  },
});

export const expireDueByUsernameAndSlug = mutation({
  args: {
    username: v.string(),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const username = sanitizeUsername(args.username);
    const slug = slugify(args.slug);
    if (!username || !slug) return { expired: false };

    const note = await ctx.db
      .query("notes")
      .withIndex("by_username_and_slug", (q) => q.eq("username", username).eq("slug", slug))
      .unique();
    if (!note) return { expired: false };

    const expired = await markDeletedIfExpired(ctx, note, Date.now());
    return { expired };
  },
});

export const expireNote = internalMutation({
  args: {
    noteId: v.id("notes"),
    expectedExpiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const note = await ctx.db.get(args.noteId);
    if (!note) return;
    if (note.state !== "active") return;
    if (note.expiresAt !== args.expectedExpiresAt) return;

    await markDeleted(ctx, note, Date.now());
  },
});

export const purgeDeletedNote = internalMutation({
  args: {
    noteId: v.id("notes"),
    expectedPurgeAt: v.number(),
  },
  handler: async (ctx, args) => {
    const note = await ctx.db.get(args.noteId);
    if (!note) return;
    if (note.state !== "deleted") return;
    if (note.purgeAt !== args.expectedPurgeAt) return;
    if (Date.now() < args.expectedPurgeAt) return;

    await ctx.db.delete(note._id);
    const deletedCount = await deleteNoteVersionBatch(ctx, note._id);
    if (deletedCount === 100) {
      await ctx.scheduler.runAfter(0, internal.notes.purgeNoteVersions, { noteId: note._id });
    }
  },
});

export const purgeNoteVersions = internalMutation({
  args: { noteId: v.id("notes") },
  handler: async (ctx, args) => {
    const deletedCount = await deleteNoteVersionBatch(ctx, args.noteId);
    if (deletedCount === 100) {
      await ctx.scheduler.runAfter(0, internal.notes.purgeNoteVersions, { noteId: args.noteId });
    }
  },
});
