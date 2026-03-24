/**
 * Create two Point demo accounts and make them friends (for manual store screenshots / demos).
 *
 * Usage: node scripts/setup-demo-friends.cjs
 *
 * Env (optional):
 *   POINT_API_BASE — default: same as point-extension production URL
 *   POINT_DEMO_USER_A, POINT_DEMO_USER_B — usernames (2–20 alphanumeric + underscore)
 *   POINT_DEMO_PASSWORD — shared password (min 4 chars)
 *
 * Defaults: marko_margin (highlight author) + penny_point (viewer / replies in thread).
 */
const apiBase =
  process.env.POINT_API_BASE || "https://hidden-warbler-881.convex.site";

const USER_A = process.env.POINT_DEMO_USER_A || "marko_margin";
const USER_B = process.env.POINT_DEMO_USER_B || "penny_point";
const PASS = process.env.POINT_DEMO_PASSWORD || "PointDemo2026";

function apiBaseNorm(b) {
  return b.replace(/\/+$/, "");
}

async function apiJson(method, pathStr, token, body) {
  const url = `${apiBaseNorm(apiBase)}${pathStr}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText || "request failed");
  return data;
}

async function registerOrLogin(username, password) {
  try {
    const data = await apiJson("POST", "/auth/register", null, {
      username,
      password,
    });
    console.log(`Registered: ${username}`);
    return data.token;
  } catch (e) {
    if (!String(e.message).toLowerCase().includes("taken")) throw e;
    const data = await apiJson("POST", "/auth/login", null, {
      username,
      password,
    });
    console.log(`Logged in (existing): ${username}`);
    return data.token;
  }
}

async function ensureFriends(tokenA, tokenB, nameA, nameB) {
  try {
    await apiJson("POST", "/friends/request", tokenB, { username: nameA });
    console.log(`${nameB} sent friend request to ${nameA}`);
  } catch (e) {
    const m = String(e.message);
    if (m.includes("Already") || m.includes("pending")) {
      console.log("Friend request already exists or already friends — OK");
    } else {
      throw e;
    }
  }
  const pending = await apiJson("GET", "/friends/pending", tokenA);
  if (Array.isArray(pending) && pending.length > 0) {
    const req = pending.find((p) => p.fromUsername === nameB) || pending[0];
    await apiJson("POST", "/friends/accept", tokenA, { requestId: req.id });
    console.log(`${nameA} accepted friend request from ${nameB}`);
  } else {
    console.log("No pending request for A (may already be friends)");
  }
}

async function main() {
  if (!/^[a-zA-Z0-9_]{2,20}$/.test(USER_A) || !/^[a-zA-Z0-9_]{2,20}$/.test(USER_B)) {
    throw new Error("POINT_DEMO_USER_A / POINT_DEMO_USER_B must be 2–20 [a-zA-Z0-9_]");
  }
  if (USER_A === USER_B) throw new Error("Usernames must differ");
  if (PASS.length < 4) throw new Error("POINT_DEMO_PASSWORD must be at least 4 characters");

  const tokenA = await registerOrLogin(USER_A, PASS);
  const tokenB = await registerOrLogin(USER_B, PASS);
  await ensureFriends(tokenA, tokenB, USER_A, USER_B);

  console.log("\n--- Log in with the unpacked extension (Chrome Web Store screenshots are captured manually) ---\n");
  console.log(`  Viewer: ${USER_B}  /  password: ${PASS}`);
  console.log(`  Author: ${USER_A}  /  same password`);
  console.log(
    `\n${USER_B} should friend ${USER_A}’s highlights; use both accounts to stage thread + picker shots.\n`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
