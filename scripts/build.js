import { mkdir, readFile, writeFile, copyFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
await mkdir(dist, { recursive: true });
let total = 0;
for (const file of await readdir(resolve(root, "public"))) {
  const source = resolve(root, "public", file);
  await copyFile(source, resolve(dist, file));
  total += gzipSync(await readFile(source)).length;
}
const rules = (await readFile(resolve(root, "public/rules.js"), "utf8")).replaceAll(/^export /gm, "");
const api = (await readFile(resolve(root, "server/api.js"), "utf8")).replace(/^import .*;\n/, "").replaceAll(/^export /gm, "");
const worker = `${rules}\n${api}\nexport default {\n  async fetch(request, env, context) {\n    if (new URL(request.url).pathname.startsWith("/api/")) return handleApi(request, env, context);\n    return env.ASSETS.fetch(request);\n  }\n};\n`;
await writeFile(resolve(dist, "_worker.js"), worker);
await writeFile(resolve(dist, "_routes.json"), JSON.stringify({ version: 1, include: ["/api/*"], exclude: [] }, null, 2));
await writeFile(resolve(dist, "_headers"), "/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self' https://itch.io https://*.itch.io\n");
console.log(`Built dist/ for Cloudflare Pages Direct Upload.\nCompressed game assets: ${total.toLocaleString()} bytes (target <= 2,000,000).\nConfigure D1 binding DB and secret SIGNING_SECRET before public leaderboard use.`);
if (total > 2000000) { console.error("Game exceeds the payload budget"); process.exitCode = 1; }
