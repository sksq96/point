import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Send a point (highlight shared to a friend, tied to a URL)
export const sendPoint = mutation({
  args: {
    token: v.string(),
    toUsername: v.string(),
    text: v.string(),
    body: v.optional(v.string()),
    url: v.string(),
    color: v.optional(v.string()),
    pageTitle: v.optional(v.string()),
  },
  handler: async (ctx, { token, toUsername, text, body, url, color, pageTitle }) => {
    const user = await ctx.db.query("users").withIndex("by_token", (q) => q.eq("token", token)).first();
    if (!user) throw new Error("Not authenticated");
    const toUser = await ctx.db.query("users").withIndex("by_username", (q) => q.eq("username", toUsername)).first();
    if (!toUser) throw new Error("User not found");

    const id = await ctx.db.insert("messages", {
      fromUserId: user._id, toUserId: toUser._id,
      kind: "point", text, body: body || "",
      url, color: color || "green", isRead: false,
      pageTitle: pageTitle || "",
    });
    return { success: true, id };
  },
});

// Send a chat message (tied to a URL thread)
export const sendChat = mutation({
  args: {
    token: v.string(),
    toUsername: v.string(),
    body: v.string(),
    url: v.optional(v.string()),
    pageTitle: v.optional(v.string()),
  },
  handler: async (ctx, { token, toUsername, body, url, pageTitle }) => {
    const user = await ctx.db.query("users").withIndex("by_token", (q) => q.eq("token", token)).first();
    if (!user) throw new Error("Not authenticated");
    const toUser = await ctx.db.query("users").withIndex("by_username", (q) => q.eq("username", toUsername)).first();
    if (!toUser) throw new Error("User not found");

    const id = await ctx.db.insert("messages", {
      fromUserId: user._id, toUserId: toUser._id,
      kind: "chat", body, isRead: false,
      url: url || undefined,
      pageTitle: pageTitle || "",
    });
    return { success: true, id };
  },
});

// Get all conversation threads (grouped by URL)
export const threads = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await ctx.db.query("users").withIndex("by_token", (q) => q.eq("token", token)).first();
    if (!user) return [];

    const received = await ctx.db.query("messages").withIndex("by_to_user", (q) => q.eq("toUserId", user._id)).order("desc").take(200);
    const sent = await ctx.db.query("messages").withIndex("by_from_user", (q) => q.eq("fromUserId", user._id)).order("desc").take(200);

    const all = [...received, ...sent];

    // Group by URL
    const urlMap: Record<string, { url: string; pageTitle: string; lastTime: number; unread: number; lastMsg: string; participants: Set<string> }> = {};

    for (const m of all) {
      const url = m.url || "direct";
      if (!urlMap[url]) {
        urlMap[url] = { url, pageTitle: "", lastTime: 0, unread: 0, lastMsg: "", participants: new Set() };
      }
      const t = urlMap[url];
      if (m._creationTime > t.lastTime) {
        t.lastTime = m._creationTime;
        t.lastMsg = m.body || m.text || "";
        if (m.pageTitle) t.pageTitle = m.pageTitle;
      }
      if (!m.isRead && m.toUserId === user._id) t.unread++;

      // Track participants
      const otherId = m.fromUserId === user._id ? m.toUserId : m.fromUserId;
      t.participants.add(otherId.toString());
    }

    // Resolve participant usernames
    const threads = await Promise.all(
      Object.values(urlMap)
        .sort((a, b) => b.lastTime - a.lastTime)
        .map(async (t) => {
          const participantNames: string[] = [];
          for (const pid of t.participants) {
            const u = await ctx.db.get(pid as any);
            if (u) participantNames.push(u.username);
          }
          return {
            url: t.url,
            pageTitle: t.pageTitle,
            lastTime: t.lastTime,
            unread: t.unread,
            lastMsg: t.lastMsg.substring(0, 60),
            participants: participantNames,
          };
        })
    );

    return threads;
  },
});

// Get messages for a specific URL thread
export const feedByUrl = query({
  args: { token: v.string(), url: v.string() },
  handler: async (ctx, { token, url }) => {
    const user = await ctx.db.query("users").withIndex("by_token", (q) => q.eq("token", token)).first();
    if (!user) return [];

    const byUrl = await ctx.db.query("messages").withIndex("by_url", (q) => q.eq("url", url)).order("asc").take(200);

    // Filter: only messages I'm part of
    const mine = byUrl.filter(m => m.fromUserId === user._id || m.toUserId === user._id);

    return await Promise.all(mine.map(async (m) => {
      const isMe = m.fromUserId === user._id;
      const other = await ctx.db.get(isMe ? m.toUserId : m.fromUserId);
      return {
        id: m._id,
        kind: m.kind,
        direction: isMe ? "out" : "in",
        who: other?.username ?? "unknown",
        text: m.text,
        body: m.body,
        url: m.url,
        color: m.color,
        is_read: m.isRead,
        created_at: m._creationTime,
      };
    }));
  },
});

// Full feed (all messages, for backward compat)
export const feed = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await ctx.db.query("users").withIndex("by_token", (q) => q.eq("token", token)).first();
    if (!user) return [];
    const received = await ctx.db.query("messages").withIndex("by_to_user", (q) => q.eq("toUserId", user._id)).order("desc").take(100);
    const sent = await ctx.db.query("messages").withIndex("by_from_user", (q) => q.eq("fromUserId", user._id)).order("desc").take(100);
    const all = [...received, ...sent].sort((a, b) => b._creationTime - a._creationTime).slice(0, 100);
    return await Promise.all(all.map(async (m) => {
      const isMe = m.fromUserId === user._id;
      const other = await ctx.db.get(isMe ? m.toUserId : m.fromUserId);
      return { id: m._id, kind: m.kind, direction: isMe ? "out" : "in", who: other?.username ?? "unknown", text: m.text, body: m.body, url: m.url, color: m.color, is_read: m.isRead, created_at: m._creationTime };
    }));
  },
});

export const unreadCount = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await ctx.db.query("users").withIndex("by_token", (q) => q.eq("token", token)).first();
    if (!user) return 0;
    const unread = await ctx.db.query("messages").withIndex("by_to_user", (q) => q.eq("toUserId", user._id)).filter((q) => q.eq(q.field("isRead"), false)).collect();
    return unread.length;
  },
});

export const markRead = mutation({
  args: { token: v.string(), messageId: v.id("messages") },
  handler: async (ctx, { token, messageId }) => {
    const user = await ctx.db.query("users").withIndex("by_token", (q) => q.eq("token", token)).first();
    if (!user) throw new Error("Not authenticated");
    const msg = await ctx.db.get(messageId);
    if (msg && msg.toUserId === user._id) await ctx.db.patch(messageId, { isRead: true });
    return { success: true };
  },
});

export const markAllRead = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await ctx.db.query("users").withIndex("by_token", (q) => q.eq("token", token)).first();
    if (!user) throw new Error("Not authenticated");
    const unread = await ctx.db.query("messages").withIndex("by_to_user", (q) => q.eq("toUserId", user._id)).filter((q) => q.eq(q.field("isRead"), false)).collect();
    for (const m of unread) await ctx.db.patch(m._id, { isRead: true });
    return { success: true };
  },
});
