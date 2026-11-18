import { VERSION, MODES, HOP, FERRY_TIME } from "../public/rules.js";

const TOKEN_AGE = 24 * 60 * 60;
const RETENTION = 30 * 24 * 60 * 60;
const encoder = new TextEncoder();
const nicknames = {
  first: ["Maple", "Sunny", "Little", "Happy", "Island", "Clever", "Mossy", "Breezy", "Dapper", "Cosy"],
  last: ["Otter", "Beaver", "Raccoon", "Pigeon", "Fox", "Sparrow", "Badger", "Robin", "Turtle", "Finch"],
};

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra } });
}

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeBase64(value) {
  if (!/^[\w-]+$/.test(value)) throw new HttpError(400, "Invalid run ticket");
  return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), character => character.charCodeAt(0));
}

async function signingKey(secret) {
  if (typeof secret !== "string" || secret.length < 32) throw new HttpError(503, "Leaderboard signing is not configured");
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signTicket(payload, secret) {
  const data = base64url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await signingKey(secret), encoder.encode(data));
  return `${data}.${base64url(new Uint8Array(signature))}`;
}

export async function verifyTicket(token, secret, now = Date.now()) {
  if (typeof token !== "string" || token.length > 2000) throw new HttpError(400, "Missing or invalid run ticket");
  const pieces = token.split(".");
  if (pieces.length !== 2) throw new HttpError(400, "Invalid run ticket");
  let payload;
  try {
    const valid = await crypto.subtle.verify("HMAC", await signingKey(secret), decodeBase64(pieces[1]), encoder.encode(pieces[0]));
    if (!valid) throw new HttpError(400, "Invalid run ticket");
    payload = JSON.parse(new TextDecoder().decode(decodeBase64(pieces[0])));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Invalid run ticket");
  }
  if (!payload || !Object.hasOwn(MODES, payload.mode) || payload.version !== VERSION ||
      typeof payload.id !== "string" || !/^[0-9a-f-]{36}$/.test(payload.id) ||
      !Number.isInteger(payload.seed) || !Number.isFinite(payload.started) ||
      !Number.isFinite(payload.expires) || payload.expires !== payload.started + TOKEN_AGE ||
      typeof payload.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(payload.day)) throw new HttpError(400, "Unsupported run ticket");
  if (now / 1000 > payload.expires) throw new HttpError(410, "Run ticket expired; this trip remains unranked");
  if (payload.started > now / 1000 + 2) throw new HttpError(400, "Run ticket is from the future");
  return payload;
}

export function torontoDay(now = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(now));
  const get = type => parts.find(part => part.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

async function digest(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

export async function dailySeed(day, mode) {
  const hash = await digest(`${day}:${mode}:${VERSION}`);
  return new DataView(hash.buffer).getUint32(0, false);
}

export function validateScore(body, ticket, now = Date.now()) {
  const config = MODES[ticket.mode];
  if (!Number.isInteger(body.elapsed) || !Number.isInteger(body.collisions) || !Number.isInteger(body.lives) ||
      body.collisions < 0 || body.collisions > 5000 || body.lives < 1 || body.lives > 5 ||
      body.completedRow !== config.rows) throw new HttpError(400, "Invalid winning result");
  const theoreticalMinimum = (config.rows * HOP + FERRY_TIME - 1) * 1000;
  if (body.elapsed < theoreticalMinimum || body.elapsed > TOKEN_AGE * 1000 ||
      body.elapsed > now - ticket.started * 1000 + 2000) throw new HttpError(400, "Completion time failed basic checks");
  const hearts = Math.floor((config.rows - 5) / (config.vendorEvery * 2));
  if (body.collisions > config.lives + hearts - 1 || body.lives > config.lives + hearts - body.collisions) throw new HttpError(400, "Life totals failed basic checks");
}

async function readBody(request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new HttpError(415, "Send application/json");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Missing request body");
  let length = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 4096) { await reader.cancel(); throw new HttpError(413, "Request is too large"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const result = JSON.parse(new TextDecoder().decode(bytes));
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Not an object");
    return result;
  } catch { throw new HttpError(400, "Invalid JSON request"); }
}

async function rateLimit(request, env, endpoint, now) {
  const minute = Math.floor(now / 60000);
  const day = torontoDay(now);
  const ip = request.headers.get("CF-Connecting-IP") || env.LOCAL_IP;
  if (!ip) throw new HttpError(503, "Request identity is unavailable");
  const identity = base64url((await digest(`${env.SIGNING_SECRET}:${day}:${ip}`)).slice(0, 16));
  const limit = endpoint === "runs" ? 20 : endpoint === "scores" ? 15 : 90;
  const key = `${identity}:${endpoint}:${minute}`;
  const result = await env.DB.prepare("INSERT INTO rate_limits (key, hits, expires) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET hits = hits + 1 RETURNING hits")
    .bind(key, minute * 60 + 172800).first();
  if (result.hits > limit) throw new HttpError(429, "Too many requests. Please wait a minute and try again");
}

export async function cleanup(env, now = Date.now()) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM scores WHERE run_id IN (SELECT run_id FROM scores WHERE submitted < ? LIMIT 200)").bind(Math.floor(now / 1000) - RETENTION),
    env.DB.prepare("DELETE FROM rate_limits WHERE key IN (SELECT key FROM rate_limits WHERE expires < ? LIMIT 500)").bind(Math.floor(now / 1000)),
  ]);
}

export async function handleApi(request, env, context = {}, now = Date.now()) {
  try {
    const url = new URL(request.url);
    const endpoint = url.pathname.replace(/^\/api\//, "");
    if (!["runs", "scores", "leaderboard"].includes(endpoint)) throw new HttpError(404, "API route not found");
    if (request.method !== (endpoint === "leaderboard" ? "GET" : "POST")) throw new HttpError(405, "Method not allowed");
    if (request.method === "POST") {
      if (request.headers.get("Origin") && request.headers.get("Origin") !== url.origin) throw new HttpError(403, "Use the game's own website to submit scores");
      if (request.headers.get("Sec-Fetch-Site") === "cross-site") throw new HttpError(403, "Cross-site submissions are not accepted");
    }
    if (!env.DB) throw new HttpError(503, "Public leaderboard is not configured. You can still play");
    await signingKey(env.SIGNING_SECRET);
    await rateLimit(request, env, endpoint, now);
    if (context.waitUntil && Math.random() < 0.02) {
      context.waitUntil(cleanup(env, now).catch(error => console.error("Leaderboard cleanup failed:", error)));
    }
    if (endpoint === "runs") {
      const body = await readBody(request);
      if (!Object.hasOwn(MODES, body.mode) || body.version !== VERSION) throw new HttpError(400, "Unsupported difficulty or game version");
      const day = torontoDay(now);
      const seed = await dailySeed(day, body.mode);
      const ticket = { id: crypto.randomUUID(), mode: body.mode, version: VERSION, seed, day, started: Math.floor(now / 1000), expires: Math.floor(now / 1000) + TOKEN_AGE };
      return json({ token: await signTicket(ticket, env.SIGNING_SECRET), seed, day });
    }
    if (endpoint === "scores") {
      const body = await readBody(request);
      const ticket = await verifyTicket(body.token, env.SIGNING_SECRET, now);
      validateScore(body, ticket, now);
      const bytes = await digest(ticket.id);
      const nickname = `${nicknames.first[bytes[0] % 10]} ${nicknames.last[bytes[1] % 10]} ${100 + new DataView(bytes.buffer).getUint16(2) % 900}`;
      const inserted = await env.DB.prepare("INSERT INTO scores (run_id, nickname, mode, day, version, elapsed, collisions, lives, submitted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(run_id) DO NOTHING RETURNING run_id")
        .bind(ticket.id, nickname, ticket.mode, ticket.day, ticket.version, body.elapsed, body.collisions, body.lives, Math.floor(now / 1000)).first();
      if (!inserted) throw new HttpError(409, "This trip has already been submitted");
      return json({ nickname, day: ticket.day }, 201);
    }
    const mode = url.searchParams.get("mode");
    if (!Object.hasOwn(MODES, mode)) throw new HttpError(400, "Unknown difficulty");
    const day = torontoDay(now);
    const result = await env.DB.prepare("SELECT nickname, elapsed, collisions, lives FROM scores WHERE mode = ? AND day = ? AND version = ? ORDER BY elapsed ASC, collisions ASC, submitted ASC, run_id ASC LIMIT 20")
      .bind(mode, day, VERSION).all();
    return json({ day, mode, entries: result.results });
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status, error.status === 429 ? { "Retry-After": "60" } : {});
    console.error("Leaderboard API failed:", error);
    return json({ error: "Public leaderboard is temporarily unavailable. Please try again later" }, 503);
  }
}
