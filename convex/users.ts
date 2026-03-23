import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const USER_COLORS = [
  "#4a7c6f", "#7baed4", "#c27c6b", "#6b8f71", "#b8926a",
  "#5b8a9a", "#c49eb8", "#8b6e5a", "#3d7a7a", "#d4856a",
  "#6a7f4e", "#9a7eb4", "#c4a24d", "#5a6e8a", "#b56d7a",
];

const PBKDF2_ITERATIONS = 100_000;
const V2_PREFIX = "v2$";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function tryHexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) return null;
    out[i] = byte;
  }
  return out;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function colorIndexForUsername(username: string): number {
  let h = 5381;
  for (let i = 0; i < username.length; i++) {
    h = Math.imul(h, 33) ^ username.charCodeAt(i);
    h >>>= 0;
  }
  return h % USER_COLORS.length;
}

function colorForUsername(username: string): string {
  const i = colorIndexForUsername(username);
  return USER_COLORS[i] ?? USER_COLORS[0]!;
}

async function hashPasswordLegacy(password: string): Promise<string> {
  const data = new TextEncoder().encode(password + "point_salt_2024");
  const buf = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(buf));
}

async function pbkdf2Sha256Hex(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new Uint8Array(salt),
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

async function hashPasswordV2(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const saltHex = bytesToHex(salt);
  const hashHex = await pbkdf2Sha256Hex(password, salt, PBKDF2_ITERATIONS);
  return `${V2_PREFIX}${PBKDF2_ITERATIONS}$${saltHex}$${hashHex}`;
}

function isV2PasswordHash(stored: string): boolean {
  return stored.startsWith(V2_PREFIX);
}

async function verifyPasswordV2(stored: string, password: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "v2") return false;
  const iterations = Number(parts[1]);
  const saltHex = parts[2];
  const expectedHex = parts[3];
  if (!Number.isFinite(iterations) || iterations < 1 || !saltHex || !expectedHex) return false;
  const salt = tryHexToBytes(saltHex);
  if (!salt || salt.length !== 16) return false;
  const hashHex = await pbkdf2Sha256Hex(password, salt, iterations);
  return timingSafeEqualHex(expectedHex, hashHex);
}

export const register = mutation({
  args: { username: v.string(), password: v.string() },
  handler: async (ctx, { username, password }) => {
    if (!/^[a-zA-Z0-9_]{2,20}$/.test(username)) throw new Error("Username must be 2-20 alphanumeric characters");
    if (password.length < 4) throw new Error("Password must be at least 4 characters");
    const existing = await ctx.db.query("users").withIndex("by_username", (q) => q.eq("username", username)).first();
    if (existing) throw new Error("Username taken");

    const passwordHash = await hashPasswordV2(password);
    const token = generateToken();
    const color = colorForUsername(username);
    const id = await ctx.db.insert("users", { username, passwordHash, token, color });
    return { user: { id, username, color }, token };
  },
});

export const login = mutation({
  args: { username: v.string(), password: v.string() },
  handler: async (ctx, { username, password }) => {
    const user = await ctx.db.query("users").withIndex("by_username", (q) => q.eq("username", username)).first();
    if (!user) throw new Error("User not found");
    const stored = user.passwordHash;
    if (!stored) throw new Error("Wrong password");

    let legacyOk = false;
    let ok: boolean;
    if (isV2PasswordHash(stored)) {
      ok = await verifyPasswordV2(stored, password);
    } else {
      legacyOk = timingSafeEqualHex(stored, await hashPasswordLegacy(password));
      ok = legacyOk;
    }
    if (!ok) throw new Error("Wrong password");

    const token = generateToken();
    const color = user.color ?? colorForUsername(user.username);

    const patch: { token: string; color?: string; passwordHash?: string } = { token };
    if (!user.color) {
      patch.color = color;
    }
    if (legacyOk) {
      patch.passwordHash = await hashPasswordV2(password);
    }
    await ctx.db.patch(user._id, patch);

    return { user: { id: user._id, username: user.username, color }, token };
  },
});

export const me = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await ctx.db.query("users").withIndex("by_token", (q) => q.eq("token", token)).first();
    if (!user) return null;
    return { id: user._id, username: user.username, color: user.color };
  },
});
