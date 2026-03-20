import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    username: v.string(),
    passwordHash: v.optional(v.string()),
    token: v.string(),
    color: v.optional(v.string()),
  })
    .index("by_username", ["username"])
    .index("by_token", ["token"]),

  friends: defineTable({
    fromUserId: v.id("users"),
    toUserId: v.id("users"),
    status: v.string(), // "pending" | "accepted" | "rejected"
  })
    .index("by_to_user", ["toUserId", "status"])
    .index("by_from_user", ["fromUserId", "status"])
    .index("by_pair", ["fromUserId", "toUserId"]),

  highlights: defineTable({
    userId: v.id("users"),
    url: v.string(),
    pageTitle: v.optional(v.string()),
    text: v.string(),
    rangeStart: v.string(),
    rangeStartOffset: v.number(),
    rangeEnd: v.string(),
    rangeEndOffset: v.number(),
  })
    .index("by_url", ["url"])
    .index("by_user", ["userId"]),

  comments: defineTable({
    highlightId: v.id("highlights"),
    userId: v.id("users"),
    body: v.string(),
  })
    .index("by_highlight", ["highlightId"]),

  points: defineTable({
    fromUserId: v.id("users"),
    toUserId: v.id("users"),
    text: v.string(),
    message: v.optional(v.string()),
    url: v.string(),
    color: v.string(),
    isRead: v.boolean(),
  })
    .index("by_to_user", ["toUserId"])
    .index("by_from_user", ["fromUserId"])
    .index("by_url", ["url"]),
});
