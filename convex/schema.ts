import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  markdownPosts: defineTable({
    slug: v.string(),
    content: v.string(),
  }).index("by_slug", ["slug"]),
  userProfiles: defineTable({
    ownerTokenIdentifier: v.string(),
    username: v.string(),
    displayName: v.union(v.string(), v.null()),
    email: v.union(v.string(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_ownerTokenIdentifier", ["ownerTokenIdentifier"])
    .index("by_username", ["username"]),
  notes: defineTable({
    ownerTokenIdentifier: v.string(),
    username: v.string(),
    title: v.string(),
    slug: v.string(),
    content: v.string(),
    visibility: v.union(v.literal("public"), v.literal("private")),
    state: v.union(v.literal("active"), v.literal("deleted")),
    createdAt: v.number(),
    updatedAt: v.number(),
    expiresAt: v.union(v.number(), v.null()),
    deletedAt: v.union(v.number(), v.null()),
    purgeAt: v.union(v.number(), v.null()),
  })
    .index("by_username_and_slug", ["username", "slug"])
    .index("by_ownerTokenIdentifier_and_slug", ["ownerTokenIdentifier", "slug"])
    .index("by_ownerTokenIdentifier_and_state_and_createdAt", [
      "ownerTokenIdentifier",
      "state",
      "createdAt",
    ])
    .index("by_state_and_purgeAt", ["state", "purgeAt"]),
  noteVersions: defineTable({
    noteId: v.id("notes"),
    ownerTokenIdentifier: v.string(),
    version: v.number(),
    title: v.string(),
    slug: v.string(),
    content: v.string(),
    visibility: v.union(v.literal("public"), v.literal("private")),
    expiresAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
    actor: v.union(
      v.literal("owner"),
      v.literal("api_key"),
      v.literal("admin"),
      v.literal("restore")
    ),
  })
    .index("by_noteId_and_version", ["noteId", "version"])
    .index("by_noteId_and_createdAt", ["noteId", "createdAt"]),
  apiKeys: defineTable({
    ownerTokenIdentifier: v.string(),
    username: v.string(),
    prefix: v.string(),
    keyHash: v.string(),
    permissions: v.union(v.literal("read"), v.literal("write"), v.literal("read_write")),
    label: v.union(v.string(), v.null()),
    createdAt: v.number(),
    lastUsedAt: v.union(v.number(), v.null()),
    revokedAt: v.union(v.number(), v.null()),
  })
    .index("by_prefix", ["prefix"])
    .index("by_ownerTokenIdentifier_and_createdAt", ["ownerTokenIdentifier", "createdAt"]),
  quickLinks: defineTable({
    ownerTokenIdentifier: v.string(),
    username: v.string(),
    key: v.string(),
    targetUrl: v.string(),
    label: v.union(v.string(), v.null()),
    clicks: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastClickedAt: v.union(v.number(), v.null()),
  })
    .index("by_ownerTokenIdentifier_and_createdAt", ["ownerTokenIdentifier", "createdAt"])
    .index("by_ownerTokenIdentifier_and_key", ["ownerTokenIdentifier", "key"])
    .index("by_username_and_key", ["username", "key"]),
  noteInvites: defineTable({
    ownerTokenIdentifier: v.string(),
    noteId: v.id("notes"),
    inviteeUsername: v.string(),
    createdAt: v.number(),
  })
    .index("by_noteId_and_inviteeUsername", ["noteId", "inviteeUsername"])
    .index("by_inviteeUsername_and_createdAt", ["inviteeUsername", "createdAt"]),
  quickLinkInvites: defineTable({
    ownerTokenIdentifier: v.string(),
    linkId: v.id("quickLinks"),
    inviteeUsername: v.string(),
    createdAt: v.number(),
  })
    .index("by_linkId_and_inviteeUsername", ["linkId", "inviteeUsername"])
    .index("by_inviteeUsername_and_createdAt", ["inviteeUsername", "createdAt"]),
  userNotifications: defineTable({
    recipientUsername: v.string(),
    kind: v.union(v.literal("invitation"), v.literal("achievement"), v.literal("notice")),
    title: v.string(),
    message: v.string(),
    noteId: v.union(v.id("notes"), v.null()),
    linkId: v.union(v.id("quickLinks"), v.null()),
    createdAt: v.number(),
    dismissedAt: v.union(v.number(), v.null()),
  })
    .index("by_recipientUsername_and_dismissedAt_and_createdAt", [
      "recipientUsername",
      "dismissedAt",
      "createdAt",
    ])
    .index("by_recipientUsername_and_createdAt", ["recipientUsername", "createdAt"]),
  pins: defineTable({
    ownerTokenIdentifier: v.string(),
    kind: v.union(v.literal("note"), v.literal("link")),
    noteId: v.union(v.id("notes"), v.null()),
    linkId: v.union(v.id("quickLinks"), v.null()),
    title: v.string(),
    href: v.string(),
    createdAt: v.number(),
  })
    .index("by_ownerTokenIdentifier_and_createdAt", ["ownerTokenIdentifier", "createdAt"])
    .index("by_ownerTokenIdentifier_and_kind_and_noteId", [
      "ownerTokenIdentifier",
      "kind",
      "noteId",
    ])
    .index("by_ownerTokenIdentifier_and_kind_and_linkId", [
      "ownerTokenIdentifier",
      "kind",
      "linkId",
    ]),
  pageMetrics: defineTable({
    ownerTokenIdentifier: v.string(),
    username: v.string(),
    slug: v.string(),
    path: v.string(),
    dayKey: v.string(),
    views: v.number(),
    lastViewedAt: v.number(),
  })
    .index("by_ownerTokenIdentifier_and_dayKey", ["ownerTokenIdentifier", "dayKey"])
    .index("by_ownerTokenIdentifier_and_slug_and_dayKey", [
      "ownerTokenIdentifier",
      "slug",
      "dayKey",
    ]),
});
