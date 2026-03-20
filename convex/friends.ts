import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const sendRequest = mutation({
  args: { token: v.string(), username: v.string() },
  handler: async (ctx, { token, username }) => {
    const user = await ctx.db.query("users").withIndex("by_token", (q) => q.eq("token", token)).first();
    if (!user) throw new Error("Not authenticated");
    if (username === user.username) throw new Error("Can't add yourself");

    const target = await ctx.db.query("users").withIndex("by_username", (q) => q.eq("username", username)).first();
    if (!target) throw new Error("User not found");

    // Already friends?
    const existing = await ctx.db.query("friends").withIndex("by_pair", (q) => q.eq("fromUserId", user._id).eq("toUserId", target._id)).first();
    if (existing && existing.status === "accepted") throw new Error("Already friends");
    if (existing && existing.status === "pending") throw new Error("Request already sent");

    // Did they send us one? Auto-accept
    const reverse = await ctx.db.query("friends").withIndex("by_pair", (q) => q.eq("fromUserId", target._id).eq("toUserId", user._id)).first();
    if (reverse && reverse.status === "pending") {
      await ctx.db.patch(reverse._id, { status: "accepted" });
      await ctx.db.insert("friends", { fromUserId: user._id, toUserId: target._id, status: "accepted" });
      return { status: "accepted", message: `You and ${username} are now friends!` };
    }

    // Clean up any old rejected request
    if (existing) await ctx.db.delete(existing._id);

    await ctx.db.insert("friends", { fromUserId: user._id, toUserId: target._id, status: "pending" });
    return { status: "pending", message: `Request sent to ${username}` };
  },
});

export const acceptRequest = mutation({
  args: { token: v.string(), requestId: v.id("friends") },
  handler: async (ctx, { token, requestId }) => {
    const user = await ctx.db.query("users").withIndex("by_token", (q) => q.eq("token", token)).first();
    if (!user) throw new Error("Not authenticated");

    const req = await ctx.db.get(requestId);
    if (!req || req.toUserId !== user._id || req.status !== "pending") throw new Error("Invalid request");

    await ctx.db.patch(requestId, { status: "accepted" });
    await ctx.db.insert("friends", { fromUserId: user._id, toUserId: req.fromUserId, status: "accepted" });
    return { success: true };
  },
});

export const rejectRequest = mutation({
  args: { token: v.string(), requestId: v.id("friends") },
  handler: async (ctx, { token, requestId }) => {
    const user = await ctx.db.query("users").withIndex("by_token", (q) => q.eq("token", token)).first();
    if (!user) throw new Error("Not authenticated");

    const req = await ctx.db.get(requestId);
    if (!req || req.toUserId !== user._id || req.status !== "pending") throw new Error("Invalid request");

    await ctx.db.patch(requestId, { status: "rejected" });
    return { success: true };
  },
});

export const pendingRequests = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await ctx.db.query("users").withIndex("by_token", (q) => q.eq("token", token)).first();
    if (!user) return [];

    const requests = await ctx.db.query("friends").withIndex("by_to_user", (q) => q.eq("toUserId", user._id).eq("status", "pending")).collect();
    return await Promise.all(requests.map(async (r) => {
      const from = await ctx.db.get(r.fromUserId);
      return { id: r._id, fromUsername: from?.username ?? "unknown", createdAt: r._creationTime };
    }));
  },
});

// Sent requests still pending
export const sentRequests = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await ctx.db.query("users").withIndex("by_token", (q) => q.eq("token", token)).first();
    if (!user) return [];

    const sent = await ctx.db.query("friends").withIndex("by_from_user", (q) => q.eq("fromUserId", user._id).eq("status", "pending")).collect();
    return await Promise.all(sent.map(async (r) => {
      const to = await ctx.db.get(r.toUserId!);
      return { id: r._id, toUsername: to?.username ?? "unknown", createdAt: r._creationTime };
    }));
  },
});

export const list = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await ctx.db.query("users").withIndex("by_token", (q) => q.eq("token", token)).first();
    if (!user) return [];

    const accepted = await ctx.db.query("friends").withIndex("by_from_user", (q) => q.eq("fromUserId", user._id).eq("status", "accepted")).collect();
    const friends = await Promise.all(accepted.map(async (f) => {
      const friend = await ctx.db.get(f.toUserId);
      return friend ? { id: friend._id, username: friend.username } : null;
    }));
    return friends.filter(Boolean);
  },
});

export const remove = mutation({
  args: { token: v.string(), friendId: v.id("users") },
  handler: async (ctx, { token, friendId }) => {
    const user = await ctx.db.query("users").withIndex("by_token", (q) => q.eq("token", token)).first();
    if (!user) throw new Error("Not authenticated");

    const f1 = await ctx.db.query("friends").withIndex("by_pair", (q) => q.eq("fromUserId", user._id).eq("toUserId", friendId)).first();
    if (f1) await ctx.db.delete(f1._id);
    const f2 = await ctx.db.query("friends").withIndex("by_pair", (q) => q.eq("fromUserId", friendId).eq("toUserId", user._id)).first();
    if (f2) await ctx.db.delete(f2._id);
    return { success: true };
  },
});

// Count pending requests (for badge)
export const pendingCount = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await ctx.db.query("users").withIndex("by_token", (q) => q.eq("token", token)).first();
    if (!user) return 0;
    const pending = await ctx.db.query("friends").withIndex("by_to_user", (q) => q.eq("toUserId", user._id).eq("status", "pending")).collect();
    return pending.length;
  },
});
