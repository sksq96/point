import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const send = mutation({
  args: {
    token: v.string(),
    toUsername: v.string(),
    text: v.string(),
    message: v.string(),
    url: v.string(),
    color: v.string(),
  },
  handler: async (ctx, { token, toUsername, text, message, url, color }) => {
    const user = await ctx.db.query("users").withIndex("by_token", (q) => q.eq("token", token)).first();
    if (!user) throw new Error("Not authenticated");

    const toUser = await ctx.db.query("users").withIndex("by_username", (q) => q.eq("username", toUsername)).first();
    if (!toUser) throw new Error("User not found");

    const id = await ctx.db.insert("points", {
      fromUserId: user._id,
      toUserId: toUser._id,
      text,
      message,
      url,
      color,
      isRead: false,
    });

    return { success: true, id };
  },
});

// Inbox: points sent TO me (chat style)
export const inbox = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await ctx.db.query("users").withIndex("by_token", (q) => q.eq("token", token)).first();
    if (!user) return [];

    const received = await ctx.db.query("points").withIndex("by_to_user", (q) => q.eq("toUserId", user._id)).order("desc").take(50);

    return await Promise.all(received.map(async (p) => {
      const from = await ctx.db.get(p.fromUserId);
      return {
        id: p._id,
        from_username: from?.username ?? "unknown",
        text: p.text,
        message: p.message,
        url: p.url,
        color: p.color,
        is_read: p.isRead,
        created_at: p._creationTime,
        direction: "incoming" as const,
      };
    }));
  },
});

// Sent: points I sent (for chat view)
export const sent = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await ctx.db.query("users").withIndex("by_token", (q) => q.eq("token", token)).first();
    if (!user) return [];

    const sentPoints = await ctx.db.query("points").withIndex("by_from_user", (q) => q.eq("fromUserId", user._id)).order("desc").take(50);

    return await Promise.all(sentPoints.map(async (p) => {
      const to = await ctx.db.get(p.toUserId);
      return {
        id: p._id,
        to_username: to?.username ?? "unknown",
        text: p.text,
        message: p.message,
        url: p.url,
        color: p.color,
        created_at: p._creationTime,
        direction: "outgoing" as const,
      };
    }));
  },
});

// Get points on a specific URL (for showing friend highlights)
export const forPage = query({
  args: { token: v.string(), url: v.string() },
  handler: async (ctx, { token, url }) => {
    const user = await ctx.db.query("users").withIndex("by_token", (q) => q.eq("token", token)).first();
    if (!user) return [];

    // Get all friends
    const friendships = await ctx.db.query("friends").withIndex("by_user", (q) => q.eq("userId", user._id)).collect();
    const friendIds = new Set(friendships.map((f) => f.friendId));

    // Get all points on this URL
    const points = await ctx.db.query("points").withIndex("by_url", (q) => q.eq("url", url)).collect();

    // Filter: points from friends TO me, or from me
    const relevant = points.filter(
      (p) =>
        (p.toUserId === user._id && friendIds.has(p.fromUserId)) ||
        p.fromUserId === user._id
    );

    return await Promise.all(relevant.map(async (p) => {
      const from = await ctx.db.get(p.fromUserId);
      const to = await ctx.db.get(p.toUserId);
      return {
        id: p._id,
        from_username: from?.username ?? "unknown",
        to_username: to?.username ?? "unknown",
        text: p.text,
        message: p.message,
        color: p.color,
        created_at: p._creationTime,
        is_mine: p.fromUserId === user._id,
      };
    }));
  },
});

export const markRead = mutation({
  args: { token: v.string(), pointId: v.id("points") },
  handler: async (ctx, { token, pointId }) => {
    const user = await ctx.db.query("users").withIndex("by_token", (q) => q.eq("token", token)).first();
    if (!user) throw new Error("Not authenticated");

    const point = await ctx.db.get(pointId);
    if (point && point.toUserId === user._id) {
      await ctx.db.patch(pointId, { isRead: true });
    }
    return { success: true };
  },
});
