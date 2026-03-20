import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    username: v.string(),
    email: v.optional(v.string()), // legacy
    passwordHash: v.optional(v.string()),
    token: v.string(),
    color: v.optional(v.string()), // auto-assigned, immutable
  })
    .index("by_username", ["username"])
    .index("by_token", ["token"]),

  friends: defineTable({
    fromUserId: v.optional(v.id("users")),
    toUserId: v.optional(v.id("users")),
    userId: v.optional(v.id("users")), // legacy
    friendId: v.optional(v.id("users")), // legacy
    status: v.optional(v.string()),
  })
    .index("by_to_user", ["toUserId", "status"])
    .index("by_from_user", ["fromUserId", "status"])
    .index("by_pair", ["fromUserId", "toUserId"])
    .index("by_user", ["userId"]),

  // Server-side highlights — visible to all friends
  highlights: defineTable({
    userId: v.id("users"),
    url: v.string(),
    pageTitle: v.optional(v.string()),
    text: v.string(),
    // Serialized range for restoring position
    rangeStart: v.string(), // XPath
    rangeStartOffset: v.number(),
    rangeEnd: v.string(), // XPath
    rangeEndOffset: v.number(),
  })
    .index("by_url", ["url"])
    .index("by_user", ["userId"]),

  // Comments on highlights (threaded)
  comments: defineTable({
    highlightId: v.id("highlights"),
    userId: v.id("users"),
    body: v.string(),
  })
    .index("by_highlight", ["highlightId"]),

  // Legacy tables
  messages: defineTable({
    fromUserId: v.id("users"),
    toUserId: v.id("users"),
    kind: v.string(),
    text: v.optional(v.string()),
    body: v.string(),
    url: v.optional(v.string()),
    color: v.optional(v.string()),
    pageTitle: v.optional(v.string()),
    isRead: v.boolean(),
  })
    .index("by_to_user", ["toUserId"])
    .index("by_from_user", ["fromUserId"])
    .index("by_url", ["url"]),

  friendRequests: defineTable({
    fromUserId: v.id("users"),
    toUserId: v.id("users"),
    status: v.string(),
  })
    .index("by_to_user", ["toUserId", "status"])
    .index("by_from_user", ["fromUserId"])
    .index("by_pair", ["fromUserId", "toUserId"]),

  points: defineTable({
    fromUserId: v.id("users"),
    toUserId: v.id("users"),
    text: v.string(),
    message: v.optional(v.string()),
    note: v.optional(v.string()),
    url: v.string(),
    color: v.string(),
    isRead: v.boolean(),
  })
    .index("by_to_user", ["toUserId"])
    .index("by_from_user", ["fromUserId"])
    .index("by_url", ["url"]),
});
