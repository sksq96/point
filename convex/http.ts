import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const http = httpRouter();

function cors() {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" };
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...cors() } });
}

function bearerToken(req: Request): string {
  return req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
}

class BadJsonError extends Error {
  constructor() {
    super("Invalid JSON");
  }
}

async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new BadJsonError();
  }
}

function bodyObj(raw: unknown): Record<string, unknown> {
  if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  throw new Error("Expected JSON object");
}

function requiredString(b: Record<string, unknown>, key: string): string {
  return String(b[key] ?? "");
}

type IdTableName = "comments" | "friends" | "highlights" | "points" | "users";

function convexId<Table extends IdTableName>(b: Record<string, unknown>, key: string): Id<Table> {
  const value = b[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Expected non-empty string for ${key}`);
  }
  return value as Id<Table>;
}

function catchHttp(e: unknown) {
  if (e instanceof BadJsonError) return json({ error: "Invalid JSON" }, 400);
  const msg = e instanceof Error ? e.message : "Request failed";
  return json({ error: msg }, 400);
}

const allPaths = [
  "/auth/register", "/auth/login", "/auth/me",
  "/friends", "/friends/request", "/friends/accept", "/friends/reject",
  "/friends/pending", "/friends/pending-count", "/friends/sent", "/friends/remove",
  "/highlights/create", "/highlights/remove", "/highlights/page", "/highlights/pages",
  "/comments/add", "/comments/list", "/comments/remove",
  "/points/send", "/points/unread", "/points/read",
];
for (const path of allPaths) {
  http.route({ path, method: "OPTIONS", handler: httpAction(async () => new Response(null, { status: 204, headers: cors() })) });
}

// ── Auth
http.route({ path: "/auth/register", method: "POST", handler: httpAction(async (ctx, req) => {
  try {
    const b = bodyObj(await readJson(req));
    return json(await ctx.runMutation(api.users.register, { username: requiredString(b, "username"), password: requiredString(b, "password") }));
  } catch (e: unknown) { return catchHttp(e); }
})});
http.route({ path: "/auth/login", method: "POST", handler: httpAction(async (ctx, req) => {
  try {
    const b = bodyObj(await readJson(req));
    return json(await ctx.runMutation(api.users.login, { username: requiredString(b, "username"), password: requiredString(b, "password") }));
  } catch (e: unknown) { return catchHttp(e); }
})});
http.route({ path: "/auth/me", method: "GET", handler: httpAction(async (ctx, req) => {
  const token = bearerToken(req);
  const user = await ctx.runQuery(api.users.me, { token });
  return user ? json(user) : json({ error: "not authenticated" }, 401);
})});

// ── Friends
http.route({ path: "/friends", method: "GET", handler: httpAction(async (ctx, req) => {
  return json(await ctx.runQuery(api.friends.list, { token: bearerToken(req) }));
})});
http.route({ path: "/friends/request", method: "POST", handler: httpAction(async (ctx, req) => {
  try {
    const token = bearerToken(req);
    const b = bodyObj(await readJson(req));
    return json(await ctx.runMutation(api.friends.sendRequest, { token, username: requiredString(b, "username") }));
  } catch (e: unknown) { return catchHttp(e); }
})});
http.route({ path: "/friends/pending", method: "GET", handler: httpAction(async (ctx, req) => {
  return json(await ctx.runQuery(api.friends.pendingRequests, { token: bearerToken(req) }));
})});
http.route({ path: "/friends/pending-count", method: "GET", handler: httpAction(async (ctx, req) => {
  return json(await ctx.runQuery(api.friends.pendingCount, { token: bearerToken(req) }));
})});
http.route({ path: "/friends/sent", method: "GET", handler: httpAction(async (ctx, req) => {
  return json(await ctx.runQuery(api.friends.sentRequests, { token: bearerToken(req) }));
})});
http.route({ path: "/friends/accept", method: "POST", handler: httpAction(async (ctx, req) => {
  try {
    const token = bearerToken(req);
    const b = bodyObj(await readJson(req));
    return json(await ctx.runMutation(api.friends.acceptRequest, { token, requestId: convexId<"friends">(b, "requestId") }));
  } catch (e: unknown) { return catchHttp(e); }
})});
http.route({ path: "/friends/reject", method: "POST", handler: httpAction(async (ctx, req) => {
  try {
    const token = bearerToken(req);
    const b = bodyObj(await readJson(req));
    return json(await ctx.runMutation(api.friends.rejectRequest, { token, requestId: convexId<"friends">(b, "requestId") }));
  } catch (e: unknown) { return catchHttp(e); }
})});
http.route({ path: "/friends/remove", method: "POST", handler: httpAction(async (ctx, req) => {
  try {
    const token = bearerToken(req);
    const b = bodyObj(await readJson(req));
    return json(await ctx.runMutation(api.friends.remove, { token, friendId: convexId<"users">(b, "userId") }));
  } catch (e: unknown) { return catchHttp(e); }
})});

// ── Highlights
http.route({ path: "/highlights/create", method: "POST", handler: httpAction(async (ctx, req) => {
  try {
    const token = bearerToken(req);
    const b = bodyObj(await readJson(req));
    return json(await ctx.runMutation(api.highlights.create, {
      token,
      url: requiredString(b, "url"),
      pageTitle: b.pageTitle === undefined || b.pageTitle === null ? undefined : String(b.pageTitle),
      text: requiredString(b, "text"),
      rangeStart: requiredString(b, "rangeStart"),
      rangeStartOffset: Number(b.rangeStartOffset ?? 0),
      rangeEnd: requiredString(b, "rangeEnd"),
      rangeEndOffset: Number(b.rangeEndOffset ?? 0),
    }));
  } catch (e: unknown) { return catchHttp(e); }
})});
http.route({ path: "/highlights/remove", method: "POST", handler: httpAction(async (ctx, req) => {
  try {
    const token = bearerToken(req);
    const b = bodyObj(await readJson(req));
    return json(await ctx.runMutation(api.highlights.remove, { token, highlightId: convexId<"highlights">(b, "highlightId") }));
  } catch (e: unknown) { return catchHttp(e); }
})});
http.route({ path: "/highlights/page", method: "POST", handler: httpAction(async (ctx, req) => {
  try {
    const token = bearerToken(req);
    const b = bodyObj(await readJson(req));
    return json(await ctx.runQuery(api.highlights.forPage, { token, url: requiredString(b, "url") }));
  } catch (e: unknown) { return catchHttp(e); }
})});
http.route({ path: "/highlights/pages", method: "GET", handler: httpAction(async (ctx, req) => {
  return json(await ctx.runQuery(api.highlights.allPages, { token: bearerToken(req) }));
})});

// ── Points (notifications)
http.route({ path: "/points/send", method: "POST", handler: httpAction(async (ctx, req) => {
  try {
    const token = bearerToken(req);
    const b = bodyObj(await readJson(req));
    return json(await ctx.runMutation(api.points.send, {
      token,
      toUsername: requiredString(b, "toUsername"),
      text: requiredString(b, "text"),
      message: requiredString(b, "message"),
      url: requiredString(b, "url"),
      color: requiredString(b, "color"),
    }));
  } catch (e: unknown) { return catchHttp(e); }
})});

http.route({ path: "/points/unread", method: "GET", handler: httpAction(async (ctx, req) => {
  return json(await ctx.runQuery(api.points.unread, { token: bearerToken(req) }));
})});
http.route({ path: "/points/read", method: "POST", handler: httpAction(async (ctx, req) => {
  try {
    const token = bearerToken(req);
    const b = bodyObj(await readJson(req));
    return json(await ctx.runMutation(api.points.markRead, { token, pointId: convexId<"points">(b, "pointId") }));
  } catch (e: unknown) { return catchHttp(e); }
})});

// ── Comments
http.route({ path: "/comments/add", method: "POST", handler: httpAction(async (ctx, req) => {
  try {
    const token = bearerToken(req);
    const b = bodyObj(await readJson(req));
    return json(await ctx.runMutation(api.comments.add, {
      token,
      highlightId: convexId<"highlights">(b, "highlightId"),
      body: requiredString(b, "body"),
    }));
  } catch (e: unknown) { return catchHttp(e); }
})});
http.route({ path: "/comments/list", method: "POST", handler: httpAction(async (ctx, req) => {
  try {
    const token = bearerToken(req);
    const b = bodyObj(await readJson(req));
    return json(await ctx.runQuery(api.comments.forHighlight, { token, highlightId: convexId<"highlights">(b, "highlightId") }));
  } catch (e: unknown) { return catchHttp(e); }
})});
http.route({ path: "/comments/remove", method: "POST", handler: httpAction(async (ctx, req) => {
  try {
    const token = bearerToken(req);
    const b = bodyObj(await readJson(req));
    return json(await ctx.runMutation(api.comments.remove, { token, commentId: convexId<"comments">(b, "commentId") }));
  } catch (e: unknown) { return catchHttp(e); }
})});

export default http;
