import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import { handleApi, cleanup } from "../server/api.js";
import { openDatabase } from "./sqlite.js";

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const root = resolve(import.meta.dirname, "../public");
await mkdir(resolve(import.meta.dirname, "../.local"), { recursive: true });
const DB = openDatabase(resolve(import.meta.dirname, "../.local/leaderboard.sqlite"));
const secret = process.env.SIGNING_SECRET || randomBytes(48).toString("base64url");
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      const body = !["GET", "HEAD"].includes(req.method) ? Readable.toWeb(req) : undefined;
      const request = new Request(url, { method: req.method, headers: req.headers, body, ...(body ? { duplex: "half" } : {}) });
      const response = await handleApi(request, { DB, SIGNING_SECRET: secret, LOCAL_IP: req.socket.remoteAddress }, { waitUntil: promise => promise.catch(error => console.error("Background operation failed:", error)) });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    if (!["GET", "HEAD"].includes(req.method)) { res.writeHead(405); res.end("Method not allowed"); return; }
    const pathname = decodeURIComponent(url.pathname);
    const file = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!file.startsWith(`${root}${sep}`)) { res.writeHead(403); res.end("Forbidden"); return; }
    const contents = await readFile(file);
    res.writeHead(200, { "Content-Type": mime[extname(file)] || "application/octet-stream", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    res.end(req.method === "HEAD" ? undefined : contents);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") { res.writeHead(404); res.end("Not found"); }
    else { console.error("Local server failed:", error); if (!res.headersSent) res.writeHead(500); res.end("Server error"); }
  }
});
server.listen(port, host, () => console.log(`Union to Island: http://${host}:${port}\nLocal development leaderboard only. Public deployment has not been configured.`));
server.on("error", error => { console.error(error); process.exitCode = 1; });
const maintenance = setInterval(() => cleanup({ DB }).catch(error => console.error("Local cleanup failed:", error)), 3600000);
maintenance.unref();
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { clearInterval(maintenance); server.close(() => { DB.close(); process.exit(0); }); });
