/// <reference types="vite/client" />
import { expect, test, describe } from "vitest";
import { convexTest } from "convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";

type TestClient = ReturnType<typeof setup>;

const modules = import.meta.glob(["../../convex/**/*.ts", "!../../convex/**/*.test.ts"]);

function setup() {
  return convexTest({ schema, modules });
}

const DEFAULT_PASSWORD = "abcd";

async function registerUser(t: TestClient, username: string, password: string = DEFAULT_PASSWORD) {
  return t.mutation(api.users.register, { username, password });
}

async function sendRequestAndAccept(
  t: TestClient,
  from: { token: string },
  toUsername: string,
  recipient: { token: string },
) {
  await t.mutation(api.friends.sendRequest, { token: from.token, username: toUsername });
  const pending = await t.query(api.friends.pendingRequests, { token: recipient.token });
  await t.mutation(api.friends.acceptRequest, {
    token: recipient.token,
    requestId: pending[0]!.id,
  });
}

function friendUsernames(friends: Array<{ username: string } | null | undefined>): string[] {
  return friends.flatMap((f) => (f ? [f.username] : []));
}

const TEST_URL = "https://example.com/article";
const RANGE = {
  rangeStart: "/html/body[1]/p[1]/text()[1]",
  rangeEnd: "/html/body[1]/p[1]/text()[1]",
  rangeStartOffset: 0,
  rangeEndOffset: 5,
};

describe("users", () => {
  test("register then login returns token", async () => {
    const t = setup();
    const reg = await registerUser(t, "u1");
    expect(reg.token).toBeTruthy();
    expect(reg.user.username).toBe("u1");
    const login = await t.mutation(api.users.login, { username: "u1", password: DEFAULT_PASSWORD });
    expect(login.token).toBeTruthy();
    expect(login.user.username).toBe("u1");
  });

  test("duplicate username on register fails", async () => {
    const t = setup();
    await registerUser(t, "dup");
    await expect(registerUser(t, "dup")).rejects.toThrow(/taken/i);
  });

  test("wrong password fails", async () => {
    const t = setup();
    await registerUser(t, "u2");
    await expect(t.mutation(api.users.login, { username: "u2", password: "wrong" })).rejects.toThrow(
      /wrong password/i,
    );
  });
});

describe("friends", () => {
  test("sendRequest creates pending; duplicate pending errors", async () => {
    const t = setup();
    const a = await registerUser(t, "fa");
    await registerUser(t, "fb");
    const r1 = await t.mutation(api.friends.sendRequest, { token: a.token, username: "fb" });
    expect(r1.status).toBe("pending");
    await expect(t.mutation(api.friends.sendRequest, { token: a.token, username: "fb" })).rejects.toThrow(
      /already sent/i,
    );
  });

  test("mutual pending auto-accepts", async () => {
    const t = setup();
    const a = await registerUser(t, "ma");
    const b = await registerUser(t, "mb");
    await t.mutation(api.friends.sendRequest, { token: a.token, username: "mb" });
    const r = await t.mutation(api.friends.sendRequest, { token: b.token, username: "ma" });
    expect(r.status).toBe("accepted");
    const listA = await t.query(api.friends.list, { token: a.token });
    expect(friendUsernames(listA)).toContain("mb");
    const listB = await t.query(api.friends.list, { token: b.token });
    expect(friendUsernames(listB)).toContain("ma");
  });

  test("only recipient can accept", async () => {
    const t = setup();
    const a = await registerUser(t, "aa");
    const b = await registerUser(t, "ab");
    const c = await registerUser(t, "ac");
    await t.mutation(api.friends.sendRequest, { token: a.token, username: "ab" });
    const pending = await t.query(api.friends.pendingRequests, { token: b.token });
    const rid = pending[0]!.id;
    await expect(t.mutation(api.friends.acceptRequest, { token: c.token, requestId: rid })).rejects.toThrow();
  });

  test("remove clears visibility of highlights for former friend", async () => {
    const t = setup();
    const a = await registerUser(t, "ra");
    const b = await registerUser(t, "rb");
    await sendRequestAndAccept(t, a, "rb", b);
    const hl = await t.mutation(api.highlights.create, {
      token: a.token,
      url: TEST_URL,
      pageTitle: "P",
      text: "hi",
      ...RANGE,
    });
    let onPage = await t.query(api.highlights.forPage, { token: b.token, url: TEST_URL });
    expect(onPage.some((h) => h.id === hl.id)).toBe(true);
    await t.mutation(api.friends.remove, { token: b.token, friendId: a.user.id });
    onPage = await t.query(api.highlights.forPage, { token: b.token, url: TEST_URL });
    expect(onPage.some((h) => h.id === hl.id)).toBe(false);
  });
});

describe("points", () => {
  test("send only between accepted friends; stranger cannot send", async () => {
    const t = setup();
    const a = await registerUser(t, "pa");
    const b = await registerUser(t, "pb");
    const stranger = await registerUser(t, "pz");
    await expect(
      t.mutation(api.points.send, {
        token: stranger.token,
        toUsername: "pb",
        text: "x",
        message: "m",
        url: TEST_URL,
        color: "#000",
      }),
    ).rejects.toThrow();
    await sendRequestAndAccept(t, a, "pb", b);
    await t.mutation(api.points.send, {
      token: a.token,
      toUsername: "pb",
      text: "hello",
      message: "msg",
      url: TEST_URL,
      color: "#111",
    });
    const unread = await t.query(api.points.unread, { token: b.token });
    expect(unread.some((p) => p.text === "hello")).toBe(true);
    expect(unread.every((p) => p.fromUsername === "pa")).toBe(true);
  });

  test("markRead only recipient flips isRead; other user no-ops", async () => {
    const t = setup();
    const a = await registerUser(t, "qa");
    const b = await registerUser(t, "qb");
    await sendRequestAndAccept(t, a, "qb", b);
    await t.mutation(api.points.send, {
      token: a.token,
      toUsername: "qb",
      text: "t",
      message: "m",
      url: TEST_URL,
      color: "#222",
    });
    const unreadBefore = await t.query(api.points.unread, { token: b.token });
    const pointId = unreadBefore[0]!.id;
    await t.mutation(api.points.markRead, { token: a.token, pointId });
    let unread = await t.query(api.points.unread, { token: b.token });
    expect(unread.some((p) => p.id === pointId)).toBe(true);
    await t.mutation(api.points.markRead, { token: b.token, pointId });
    unread = await t.query(api.points.unread, { token: b.token });
    expect(unread.some((p) => p.id === pointId)).toBe(false);
  });
});

describe("highlights and comments", () => {
  test("forPage hides non-friend highlights", async () => {
    const t = setup();
    const a = await registerUser(t, "ha");
    const b = await registerUser(t, "hb");
    const hl = await t.mutation(api.highlights.create, {
      token: a.token,
      url: TEST_URL,
      pageTitle: "P",
      text: "secret",
      ...RANGE,
    });
    let forB = await t.query(api.highlights.forPage, { token: b.token, url: TEST_URL });
    expect(forB.some((h) => h.id === hl.id)).toBe(false);
    await sendRequestAndAccept(t, a, "hb", b);
    forB = await t.query(api.highlights.forPage, { token: b.token, url: TEST_URL });
    expect(forB.some((h) => h.id === hl.id)).toBe(true);
  });

  test("comments.add denied for non-friend; allowed when friends", async () => {
    const t = setup();
    const a = await registerUser(t, "ca");
    const b = await registerUser(t, "cb");
    const hl = await t.mutation(api.highlights.create, {
      token: a.token,
      url: TEST_URL,
      pageTitle: "P",
      text: "body",
      ...RANGE,
    });
    await expect(
      t.mutation(api.comments.add, { token: b.token, highlightId: hl.id, body: "nope" }),
    ).rejects.toThrow(/can't comment/i);
    await sendRequestAndAccept(t, a, "cb", b);
    await t.mutation(api.comments.add, { token: b.token, highlightId: hl.id, body: "yes" });
    const list = await t.query(api.comments.forHighlight, { token: b.token, highlightId: hl.id });
    expect(list.some((c) => c.body === "yes")).toBe(true);
  });
});

describe("http smoke", () => {
  test("auth/me without token returns 401", async () => {
    const t = setup();
    const res = await t.fetch("/auth/me", { method: "GET" });
    expect(res.status).toBe(401);
  });

  test.each([
    ["no bearer", {}],
    ["invalid bearer", { headers: { Authorization: "Bearer deadbeefnotatoken" } }],
  ] as const)("GET /friends with %s returns 401", async (_label, init) => {
    const t = setup();
    const res = await t.fetch("/friends", { method: "GET", ...init });
    expect(res.status).toBe(401);
  });

  test("invalid JSON on login returns 400", async () => {
    const t = setup();
    const res = await t.fetch("/auth/login", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    const j = (await res.json()) as { error?: string };
    expect(j.error).toMatch(/invalid json/i);
  });

  test("unknown path returns 404", async () => {
    const t = setup();
    const res = await t.fetch("/no-such-route", { method: "GET" });
    expect(res.status).toBe(404);
  });
});
