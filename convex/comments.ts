import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const add = mutation({
  args: { token: v.string(), highlightId: v.id("highlights"), body: v.string() },
  handler: async (ctx, { token, highlightId, body }) => {
    const user = await ctx.db.query("users").withIndex("by_token", (q) => q.eq("token", token)).first();
    if (!user) throw new Error("Not authenticated");
    const id = await ctx.db.insert("comments", { highlightId, userId: user._id, body });
    return { id, username: user.username, color: user.color };
  },
});

export const forHighlight = query({
  args: { token: v.string(), highlightId: v.id("highlights") },
  handler: async (ctx, { token, highlightId }) => {
    const user = await ctx.db.query("users").withIndex("by_token", (q) => q.eq("token", token)).first();
    if (!user) return [];

    const comments = await ctx.db.query("comments").withIndex("by_highlight", (q) => q.eq("highlightId", highlightId)).collect();
    return await Promise.all(comments.map(async (c) => {
      const author = await ctx.db.get(c.userId);
      return {
        id: c._id,
        username: author?.username ?? "unknown",
        color: author?.color ?? "#ccc",
        body: c.body,
        createdAt: c._creationTime,
        isMine: c.userId === user._id,
      };
    }));
  },
});

export const remove = mutation({
  args: { token: v.string(), commentId: v.id("comments") },
  handler: async (ctx, { token, commentId }) => {
    const user = await ctx.db.query("users").withIndex("by_token", (q) => q.eq("token", token)).first();
    if (!user) throw new Error("Not authenticated");
    const c = await ctx.db.get(commentId);
    if (!c || c.userId !== user._id) throw new Error("Not your comment");
    await ctx.db.delete(commentId);
    return { success: true };
  },
});
