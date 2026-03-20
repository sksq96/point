import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

function cors() {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" };
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...cors() } });
}

const allPaths = [
  "/auth/register", "/auth/login", "/auth/me",
  "/friends", "/friends/request", "/friends/accept", "/friends/reject",
  "/friends/pending", "/friends/pending-count", "/friends/sent", "/friends/remove",
  "/highlights/create", "/highlights/remove", "/highlights/page", "/highlights/pages",
  "/comments/add", "/comments/list", "/comments/remove",
  // Legacy
  "/messages/point", "/messages/chat", "/messages/feed", "/messages/feed-by-url",
  "/messages/threads", "/messages/unread", "/messages/read", "/messages/read-all",
];
for (const path of allPaths) {
  http.route({ path, method: "OPTIONS", handler: httpAction(async () => new Response(null, { status: 204, headers: cors() })) });
}

// ── Auth
http.route({ path: "/auth/register", method: "POST", handler: httpAction(async (ctx, req) => {
  try { return json(await ctx.runMutation(api.users.register, await req.json())); } catch (e: any) { return json({ error: e.message }, 400); }
})});
http.route({ path: "/auth/login", method: "POST", handler: httpAction(async (ctx, req) => {
  try { return json(await ctx.runMutation(api.users.login, await req.json())); } catch (e: any) { return json({ error: e.message }, 400); }
})});
http.route({ path: "/auth/me", method: "GET", handler: httpAction(async (ctx, req) => {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  const user = await ctx.runQuery(api.users.me, { token });
  return user ? json(user) : json({ error: "not authenticated" }, 401);
})});

// ── Friends
http.route({ path: "/friends", method: "GET", handler: httpAction(async (ctx, req) => {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  return json(await ctx.runQuery(api.friends.list, { token }));
})});
http.route({ path: "/friends/request", method: "POST", handler: httpAction(async (ctx, req) => {
  try { const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? ""; const { username } = await req.json(); return json(await ctx.runMutation(api.friends.sendRequest, { token, username })); } catch (e: any) { return json({ error: e.message }, 400); }
})});
http.route({ path: "/friends/pending", method: "GET", handler: httpAction(async (ctx, req) => {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  return json(await ctx.runQuery(api.friends.pendingRequests, { token }));
})});
http.route({ path: "/friends/pending-count", method: "GET", handler: httpAction(async (ctx, req) => {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  return json(await ctx.runQuery(api.friends.pendingCount, { token }));
})});
http.route({ path: "/friends/sent", method: "GET", handler: httpAction(async (ctx, req) => {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  return json(await ctx.runQuery(api.friends.sentRequests, { token }));
})});
http.route({ path: "/friends/accept", method: "POST", handler: httpAction(async (ctx, req) => {
  try { const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? ""; const { requestId } = await req.json(); return json(await ctx.runMutation(api.friends.acceptRequest, { token, requestId })); } catch (e: any) { return json({ error: e.message }, 400); }
})});
http.route({ path: "/friends/reject", method: "POST", handler: httpAction(async (ctx, req) => {
  try { const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? ""; const { requestId } = await req.json(); return json(await ctx.runMutation(api.friends.rejectRequest, { token, requestId })); } catch (e: any) { return json({ error: e.message }, 400); }
})});
http.route({ path: "/friends/remove", method: "POST", handler: httpAction(async (ctx, req) => {
  try { const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? ""; const { userId } = await req.json(); return json(await ctx.runMutation(api.friends.remove, { token, friendId: userId })); } catch (e: any) { return json({ error: e.message }, 400); }
})});

// ── Highlights
http.route({ path: "/highlights/create", method: "POST", handler: httpAction(async (ctx, req) => {
  try { const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? ""; const b = await req.json(); return json(await ctx.runMutation(api.highlights.create, { token, ...b })); } catch (e: any) { return json({ error: e.message }, 400); }
})});
http.route({ path: "/highlights/remove", method: "POST", handler: httpAction(async (ctx, req) => {
  try { const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? ""; const { highlightId } = await req.json(); return json(await ctx.runMutation(api.highlights.remove, { token, highlightId })); } catch (e: any) { return json({ error: e.message }, 400); }
})});
http.route({ path: "/highlights/page", method: "POST", handler: httpAction(async (ctx, req) => {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? ""; const { url } = await req.json();
  return json(await ctx.runQuery(api.highlights.forPage, { token, url }));
})});
http.route({ path: "/highlights/pages", method: "GET", handler: httpAction(async (ctx, req) => {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  return json(await ctx.runQuery(api.highlights.allPages, { token }));
})});

// ── Comments
http.route({ path: "/comments/add", method: "POST", handler: httpAction(async (ctx, req) => {
  try { const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? ""; const b = await req.json(); return json(await ctx.runMutation(api.comments.add, { token, ...b })); } catch (e: any) { return json({ error: e.message }, 400); }
})});
http.route({ path: "/comments/list", method: "POST", handler: httpAction(async (ctx, req) => {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? ""; const { highlightId } = await req.json();
  return json(await ctx.runQuery(api.comments.forHighlight, { token, highlightId }));
})});
http.route({ path: "/comments/remove", method: "POST", handler: httpAction(async (ctx, req) => {
  try { const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? ""; const { commentId } = await req.json(); return json(await ctx.runMutation(api.comments.remove, { token, commentId })); } catch (e: any) { return json({ error: e.message }, 400); }
})});

// ── Legacy messages (keep for backward compat)
http.route({ path: "/messages/feed", method: "GET", handler: httpAction(async (ctx, req) => {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  return json(await ctx.runQuery(api.messages.feed, { token }));
})});
http.route({ path: "/messages/threads", method: "GET", handler: httpAction(async (ctx, req) => {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  return json(await ctx.runQuery(api.messages.threads, { token }));
})});
http.route({ path: "/messages/unread", method: "GET", handler: httpAction(async (ctx, req) => {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  return json(await ctx.runQuery(api.messages.unreadCount, { token }));
})});
http.route({ path: "/messages/feed-by-url", method: "POST", handler: httpAction(async (ctx, req) => {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? ""; const { url } = await req.json();
  return json(await ctx.runQuery(api.messages.feedByUrl, { token, url }));
})});
http.route({ path: "/messages/point", method: "POST", handler: httpAction(async (ctx, req) => {
  try { const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? ""; const b = await req.json(); return json(await ctx.runMutation(api.messages.sendPoint, { token, ...b })); } catch (e: any) { return json({ error: e.message }, 400); }
})});
http.route({ path: "/messages/chat", method: "POST", handler: httpAction(async (ctx, req) => {
  try { const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? ""; const b = await req.json(); return json(await ctx.runMutation(api.messages.sendChat, { token, ...b })); } catch (e: any) { return json({ error: e.message }, 400); }
})});
http.route({ path: "/messages/read", method: "POST", handler: httpAction(async (ctx, req) => {
  try { const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? ""; const { messageId } = await req.json(); return json(await ctx.runMutation(api.messages.markRead, { token, messageId })); } catch (e: any) { return json({ error: e.message }, 400); }
})});
http.route({ path: "/messages/read-all", method: "POST", handler: httpAction(async (ctx, req) => {
  try { const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? ""; return json(await ctx.runMutation(api.messages.markAllRead, { token })); } catch (e: any) { return json({ error: e.message }, 400); }
})});

export default http;
