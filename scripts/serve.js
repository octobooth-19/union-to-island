import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const root = resolve(import.meta.dirname, "../public");
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
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
server.listen(port, host, () => console.log(`Union to Island: http://${host}:${port}\nLeaderboard scores are stored in each browser.`));
server.on("error", error => { console.error(error); process.exitCode = 1; });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { server.close(() => process.exit(0)); });
