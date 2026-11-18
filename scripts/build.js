import { mkdir, readFile, writeFile, copyFile, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
await mkdir(dist, { recursive: true });
for (const file of ["_worker.js", "_routes.json"]) await rm(resolve(dist, file), { force: true });
let total = 0;
for (const file of await readdir(resolve(root, "public"))) {
  const source = resolve(root, "public", file);
  await copyFile(source, resolve(dist, file));
  total += gzipSync(await readFile(source)).length;
}
await writeFile(resolve(dist, "_headers"), "/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self' https://itch.io https://*.itch.io\n");
console.log(`Built static game in dist/.\nCompressed game assets: ${total.toLocaleString()} bytes (target <= 2,000,000).`);
if (total > 2000000) { console.error("Game exceeds the payload budget"); process.exitCode = 1; }
