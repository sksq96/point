import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const USER_COLORS = [
  "#8bc49e", "#7baed4", "#c49eb8", "#a3c47b", "#9bb4d6",
  "#d4a87b", "#7bc4b8", "#b89ec4", "#c4b87b", "#7b9ec4",
];

function generateToken() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let t = "";
  for (let i = 0; i < 48; i++) t += chars[Math.floor(Math.random() * chars.length)];
  return t;
}

async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password + "point_salt_2024");
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export const register = mutation({
  args: { username: v.string(), password: v.string() },
  handler: async (ctx, { username, password }) => {
    if (!/^[a-zA-Z0-9_]{2,20}$/.test(username)) throw new Error("Username must be 2-20 alphanumeric characters");
    if (password.length < 4) throw new Error("Password must be at least 4 characters");
    const existing = await ctx.db.query("users").withIndex("by_username", (q) => q.eq("username", username)).first();
    if (existing) throw new Error("Username taken");

    const passwordHash = await hashPassword(password);
    const token = generateToken();
    // Assign a color based on count of existing users
    const allUsers = await ctx.db.query("users").collect();
    const color = USER_COLORS[allUsers.length % USER_COLORS.length];
    const id = await ctx.db.insert("users", { username, passwordHash, token, color });
    return { user: { id, username, color }, token };
  },
});

export const login = mutation({
  args: { username: v.string(), password: v.string() },
  handler: async (ctx, { username, password }) => {
    const user = await ctx.db.query("users").withIndex("by_username", (q) => q.eq("username", username)).first();
    if (!user) throw new Error("User not found");
    const passwordHash = await hashPassword(password);
    if (user.passwordHash !== passwordHash) throw new Error("Wrong password");
    const token = generateToken();
    // Assign color if missing (legacy users)
    let color = user.color;
    if (!color) {
      const allUsers = await ctx.db.query("users").collect();
      color = USER_COLORS[allUsers.length % USER_COLORS.length];
      await ctx.db.patch(user._id, { token, color });
    } else {
      await ctx.db.patch(user._id, { token });
    }
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
