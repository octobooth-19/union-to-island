import test from "node:test";
import assert from "node:assert/strict";
import { handleApi, signTicket, verifyTicket, torontoDay, dailySeed, cleanup } from "../server/api.js";
import { MODES, VERSION } from "../public/rules.js";
import { openDatabase } from "../scripts/sqlite.js";

const SECRET = "test-only-signing-secret-not-a-production-credential";
const NOW = Date.UTC(2026, 10, 18, 19, 0, 0);
function fixture() {
  const DB = openDatabase();
  return { DB, SIGNING_SECRET: SECRET, LOCAL_IP: "127.0.0.1" };
}
function request(path, data, headers = {}) {
  return new Request(`https://game.example/api/${path}`, { method: data ? "POST" : "GET", headers: { ...(data ? { "Content-Type": "application/json", Origin: "https://game.example" } : {}), ...headers }, body: data ? JSON.stringify(data) : undefined });
}
function ticket(mode = "easy", changes = {}) {
  return { id: crypto.randomUUID(), mode, version: VERSION, day: torontoDay(NOW), seed: 1, started: NOW / 1000 - 400, expires: NOW / 1000 - 400 + 86400, ...changes };
}
async function score(env, mode = "easy", fields = {}, claims = {}) {
  return handleApi(request("scores", { token: await signTicket(ticket(mode, claims), SECRET), elapsed: mode === "hard" ? 300000 : mode === "medium" ? 180000 : 60000, collisions: 0, lives: MODES[mode].lives, completedRow: MODES[mode].rows, ...fields }), env, {}, NOW);
}

test("Toronto calendar day handles midnight and daylight saving", async () => {
  assert.equal(torontoDay(Date.UTC(2026, 10, 18, 2)), "2026-11-17");
  assert.equal(torontoDay(Date.UTC(2026, 6, 18, 4, 1)), "2026-07-18");
  assert.equal(await dailySeed("2026-11-18", "easy"), await dailySeed("2026-11-18", "easy"));
  assert.notEqual(await dailySeed("2026-11-18", "easy"), await dailySeed("2026-11-18", "hard"));
});

test("tickets are signed, expire, and reject payload tampering", async () => {
  const claims = ticket();
  const token = await signTicket(claims, SECRET);
  assert.deepEqual(await verifyTicket(token, SECRET, NOW), claims);
  await assert.rejects(verifyTicket(token, SECRET, NOW + 86400000), /expired/);
  await assert.rejects(verifyTicket(`${token.slice(0, -8)}tampered`, SECRET, NOW), /Invalid/);
  await assert.rejects(verifyTicket("malformed", SECRET, NOW), /Invalid/);
});

test("start, win, publish, and read a shared board; prevent duplicate submissions", async t => {
  const env = fixture(); t.after(() => env.DB.close());
  const start = await handleApi(request("runs", { mode: "easy", version: VERSION }), env, {}, NOW - 65000);
  assert.equal(start.status, 200);
  const issued = await start.json();
  const payload = { token: issued.token, elapsed: 60000, collisions: 0, lives: 5, completedRow: 78 };
  const accepted = await handleApi(request("scores", payload), env, {}, NOW);
  assert.equal(accepted.status, 201);
  const { nickname } = await accepted.json();
  assert.match(nickname, /^[A-Za-z]+ [A-Za-z]+ \d{3}$/);
  assert.equal((await handleApi(request("scores", payload), env, {}, NOW)).status, 409);
  const board = await (await handleApi(request("leaderboard?mode=easy"), env, {}, NOW)).json();
  assert.equal(board.entries.length, 1);
  assert.equal(board.entries[0].nickname, nickname);
  assert.equal(board.entries[0].elapsed, 60000);
  const otherMode = await (await handleApi(request("leaderboard?mode=hard"), env, {}, NOW)).json();
  assert.deepEqual(otherMode.entries, []);
});

test("ranking sorts winning runs by time, then collisions, and separates days", async t => {
  const env = fixture(); t.after(() => env.DB.close());
  assert.equal((await score(env, "easy", { elapsed: 70000 })).status, 201);
  assert.equal((await score(env, "easy", { elapsed: 60000, collisions: 1, lives: 4 })).status, 201);
  assert.equal((await score(env, "easy", { elapsed: 60000 })).status, 201);
  assert.equal((await score(env, "easy", {}, { day: "2026-11-17" })).status, 201);
  const board = await (await handleApi(request("leaderboard?mode=easy"), env, {}, NOW)).json();
  assert.deepEqual(board.entries.map(row => [row.elapsed, row.collisions]), [[60000, 0], [60000, 1], [70000, 0]]);
});

test("invalid results, impossible timing/lives, and outdated versions are rejected", async t => {
  const env = fixture(); t.after(() => env.DB.close());
  for (const fields of [{ elapsed: 1 }, { elapsed: 999999 }, { lives: 0 }, { collisions: -1 }, { collisions: 99 }, { completedRow: 2 }]) {
    assert.equal((await score(env, "easy", fields)).status, 400, JSON.stringify(fields));
  }
  assert.equal((await handleApi(request("runs", { mode: "__proto__", version: VERSION }), env, {}, NOW)).status, 400);
  assert.equal((await score(env, "easy", {}, { version: "old" })).status, 400);
});

test("request limits, method and origin enforcement, and body size limits", async t => {
  const env = fixture(); t.after(() => env.DB.close());
  assert.equal((await handleApi(request("scores", {}, { Origin: "https://other.example" }), env, {}, NOW)).status, 403);
  assert.equal((await handleApi(request("runs"), env, {}, NOW)).status, 405);
  const huge = new Request("https://game.example/api/scores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: "x".repeat(5000) }) });
  assert.equal((await handleApi(huge, env, {}, NOW)).status, 413);
  let response;
  for (let i = 0; i < 21; i++) response = await handleApi(request("runs", { mode: "easy", version: VERSION }), env, {}, NOW);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "60");
});

test("unconfigured backend responds explicitly instead of pretending to save", async () => {
  const response = await handleApi(request("leaderboard?mode=easy"), {}, {}, NOW);
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /not configured/);
});

test("retention removes old rows without deleting recent replay protection", async t => {
  const env = fixture(); t.after(() => env.DB.close());
  await score(env);
  env.DB.raw.prepare("UPDATE scores SET submitted = ?").run(NOW / 1000 - 31 * 86400);
  await score(env);
  await cleanup(env, NOW);
  assert.equal(env.DB.raw.prepare("SELECT count(*) AS count FROM scores").get().count, 1);
});
