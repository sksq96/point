import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Create a highlight (server-side, visible to friends)
export const create = mutation({
  args: {
    token: v.string(),
    url: v.string(),
    pageTitle: v.optional(v.string()),
    text: v.string(),
    rangeStart: v.string(),
    rangeStartOffset: v.number(),
    rangeEnd: v.string(),
    rangeEndOffset: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.query("users").withIndex("by_token", (q) => q.eq("token", args.token)).first();
    if (!user) throw new Error("Not authenticated");

    const id = await ctx.db.insert("highlights", {
      userId: user._id,
      url: args.url,
      pageTitle: args.pageTitle,
      text: args.text,
      rangeStart: args.rangeStart,
      rangeStartOffset: args.rangeStartOffset,
      rangeEnd: args.rangeEnd,
      rangeEndOffset: args.rangeEndOffset,
    });
    return { id, color: user.color, username: user.username };
  },
});

// Delete a highlight
export const remove = mutation({
  args: { token: v.string(), highlightId: v.id("highlights") },
  handler: async (ctx, { token, highlightId }) => {
    const user = await ctx.db.query("users").withIndex("by_token", (q) => q.eq("token", token)).first();
    if (!user) throw new Error("Not authenticated");
    const h = await ctx.db.get(highlightId);
    if (!h || h.userId !== user._id) throw new Error("Not your highlight");
    // Delete all comments on this highlight
    const comments = await ctx.db.query("comments").withIndex("by_highlight", (q) => q.eq("highlightId", highlightId)).collect();
    for (const c of comments) await ctx.db.delete(c._id);
    await ctx.db.delete(highlightId);
    return { success: true };
  },
});

// Get all highlights for a URL (from user + friends)
export const forPage = query({
  args: { token: v.string(), url: v.string() },
  handler: async (ctx, { token, url }) => {
    const user = await ctx.db.query("users").withIndex("by_token", (q) => q.eq("token", token)).first();
    if (!user) return [];

    // Get friend IDs
    const friendships = await ctx.db.query("friends").withIndex("by_from_user", (q) => q.eq("fromUserId", user._id).eq("status", "accepted")).collect();
    const friendIds = new Set(friendships.map(f => f.toUserId!.toString()));
    friendIds.add(user._id.toString()); // include self

    // Get all highlights on this URL
    const allHighlights = await ctx.db.query("highlights").withIndex("by_url", (q) => q.eq("url", url)).collect();

    // Filter to self + friends
    const visible = allHighlights.filter(h => friendIds.has(h.userId.toString()));

    // Get comment counts
    return await Promise.all(visible.map(async (h) => {
      const author = await ctx.db.get(h.userId);
      const comments = await ctx.db.query("comments").withIndex("by_highlight", (q) => q.eq("highlightId", h._id)).collect();
      return {
        id: h._id,
        userId: h.userId,
        username: author?.username ?? "unknown",
        color: author?.color ?? "#ccc",
        text: h.text,
        rangeStart: h.rangeStart,
        rangeStartOffset: h.rangeStartOffset,
        rangeEnd: h.rangeEnd,
        rangeEndOffset: h.rangeEndOffset,
        commentCount: comments.length,
        createdAt: h._creationTime,
        isMine: h.userId === user._id,
      };
    }));
  },
});

// Get all pages with highlights (for conversation list)
export const allPages = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await ctx.db.query("users").withIndex("by_token", (q) => q.eq("token", token)).first();
    if (!user) return [];

    const friendships = await ctx.db.query("friends").withIndex("by_from_user", (q) => q.eq("fromUserId", user._id).eq("status", "accepted")).collect();
    const friendIds = new Set(friendships.map(f => f.toUserId!.toString()));
    friendIds.add(user._id.toString());

    // Get my highlights + friends' highlights
    const myHighlights = await ctx.db.query("highlights").withIndex("by_user", (q) => q.eq("userId", user._id)).collect();

    // Get friend highlights (need to iterate friends)
    const friendHighlights: any[] = [];
    for (const fId of friendIds) {
      if (fId === user._id.toString()) continue;
      const fh = await ctx.db.query("highlights").withIndex("by_user", (q) => q.eq("userId", fId as any)).collect();
      friendHighlights.push(...fh);
    }

    const all = [...myHighlights, ...friendHighlights];

    // Group by URL
    const urlMap: Record<string, { url: string; pageTitle: string; highlightCount: number; lastTime: number; participants: Set<string> }> = {};
    for (const h of all) {
      if (!urlMap[h.url]) urlMap[h.url] = { url: h.url, pageTitle: "", highlightCount: 0, lastTime: 0, participants: new Set() };
      const entry = urlMap[h.url];
      entry.highlightCount++;
      if (h._creationTime > entry.lastTime) entry.lastTime = h._creationTime;
      if (h.pageTitle) entry.pageTitle = h.pageTitle;
      entry.participants.add(h.userId.toString());
    }

    const pages = await Promise.all(
      Object.values(urlMap)
        .sort((a, b) => b.lastTime - a.lastTime)
        .map(async (p) => {
          const participants: { username: string; color: string }[] = [];
          for (const uid of p.participants) {
            const u = await ctx.db.get(uid as any);
            if (u) participants.push({ username: u.username, color: u.color || "#999" });
          }
          return {
            url: p.url,
            pageTitle: p.pageTitle,
            highlightCount: p.highlightCount,
            lastTime: p.lastTime,
            participants,
          };
        })
    );
    return pages;
  },
});
