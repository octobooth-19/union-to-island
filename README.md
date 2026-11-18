# Union to Island

An original, dependency-free Toronto crossing game: choose Kit the Code Cat,
Ducky the Debug Duck, Bolt the Chat Bot, or Ace the Co-Pilot (original
characters styled after GitHub-type developer mascots), then travel from Union
Station to Toronto Island. Cross cars, bikes, and pedestrians; visit striped
vendor carts for a shield or an extra life; board the ferry to win.

## Play now

**Live (free, GitHub Pages):** <https://octobooth-19.github.io/union-to-island/>

The `.github/workflows/pages.yml` workflow republishes `public/` on every push
to `main`. GitHub Pages is static, so trips there are **unranked** (the game
says so on start). The public leaderboard goes live once the Cloudflare
deployment below is completed. The current QR code will still open GitHub Pages;
generate a new QR code for the Cloudflare URL when that deployment is ready.

The [print-ready QR code](https://raw.githubusercontent.com/octobooth-19/union-to-island/main/union-to-island-qr.png)
encodes the GitHub Pages URL above and includes a four-module white border. Verify
it with real phones at its intended print size. To generate another code, use
CoreImage's `CIQRCodeGenerator` on macOS or Chrome's **Share → Create QR code**
on the deployed page.

## Run locally

Use **Node.js 22.13+**, with its built-in SQLite support. No package installation
or build is needed for local play.

```sh
node scripts/serve.js
```

Open <http://127.0.0.1:4173>. The local leaderboard persists in
`.local/leaderboard.sqlite`. This is a development server, not a production host.
Its signing secret is randomly generated on restart unless `SIGNING_SECRET`
is set; restarting invalidates outstanding local tickets.

To try a physical phone on the same trusted Wi-Fi, start with
`HOST=0.0.0.0 node scripts/serve.js` and open the computer's LAN IP and port.
Do not expose the development server to the public internet. Clipboard sharing
may require HTTPS outside localhost.

Controls: swipe, D-pad, arrow keys, or WASD. E collects a nearby vendor reward.
P/Escape pauses. Changing tabs pauses automatically; use Resume to continue.
Close the browser to end a trip; in-progress runs are not saved.

## Rules

Easy/Medium/Hard target approximately **1/3/5 minutes per successful attempt**,
not deadlines. They have progressively longer routes, faster traffic, and
5/3/2 starting lives. Durations still need representative human playtesting;
they are not guaranteed and fast players can finish sooner.

Life cap is 5. Shields last 6/5/4 seconds by mode and refresh rather than stack.
Each vendor is usable once per trip. Full-health players can save a heart cart
for later. A hit removes one life and respawns at a safe checkpoint with brief
protection. The terminal starts the ferry; only island arrival wins.

The timer includes active waiting and the ferry but excludes tutorials,
menus, and pauses. Leaderboards show today's top 20 winning runs per mode,
using Toronto's calendar date and a common daily seed. Ties use collisions,
then submission order. A run belongs to its start day and game version, so a
trip crossing midnight may not appear in the new day's board.

The leaderboard is casual: signed tickets, timing/life checks, duplicate
prevention, generated names, and request throttling deter basic abuse but
cannot prove play in an untrusted browser. **Do not use it to award prizes.**

## Verify and package

```sh
node --test
node scripts/build.js
node --check dist/_worker.js
```

Tests use the actual API logic with a built-in SQLite adapter, plus pure game
simulation. The route solver checks full successful trips without boosts;
it is a test driver and is not shipped with the frontend.

`dist/` contains the complete Cloudflare Pages **advanced-mode** upload:
static game files, a bundled ES-module `_worker.js`, `_routes.json` limited to
`/api/*`, and security headers. No runtime npm packages are required.

## Free public deployment: Cloudflare Pages + D1

**Status:** the unranked static game is live on GitHub Pages (above). The
Cloudflare upload bundle for the ranked version is prepared but needs a
Cloudflare account to deploy.

1. Sign in to an authorized Cloudflare account on its free plan. Create a D1
   database, then execute `migrations/0001_leaderboard.sql` in its SQL console.
2. Create a Pages Direct Upload project. Upload the **contents** of `dist/`
   (including `_worker.js`), not the repository root or `public/` alone.
   The dashboard supports advanced-mode `_worker.js`, not source-file
   Functions compilation. If your dashboard does not accept a Worker upload,
   use Cloudflare's documented Pages deployment tooling in an authorized Cloud
   environment; do not strip the Worker and claim the leaderboard is deployed.
3. In that Pages project's production settings, add a D1 binding named `DB`.
   Add a secret named `SIGNING_SECRET` with at least 32 cryptographically random
   characters. Generate one locally, paste directly into the secret field, and
   never commit or print it in documentation:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
   ```

4. Redeploy after binding/secrets changes. Configure separate preview bindings
   if using previews, so testing does not write into the production board.
5. Open the public `https://<project>.pages.dev` address. Confirm
   `/api/leaderboard?mode=easy` returns JSON rather than an HTML page. Complete a
   real run, submit once, and verify another browser sees the result.
6. Confirm static files remain available if the API is unavailable. The UI
   must explicitly show unranked/submission-failed status, never fake success.
7. Keep free plans selected, check usage, and do not enable paid add-ons or
   automatic upgrades. A provider URL avoids purchasing a custom domain.

Pages Functions use Workers quotas: currently 100,000 dynamic requests/day and
10 ms CPU/invocation. D1 currently includes 5 million rows read/day, 100,000 rows
written/day, 5 GB storage/account, and at most 500 MB per free database. Index
updates and rate limiting use writes. Account allowances are shared.
Limits and terms change; verify before launch:
[Pages](https://developers.cloudflare.com/pages/platform/limits/),
[Workers](https://developers.cloudflare.com/workers/platform/pricing/),
[D1](https://developers.cloudflare.com/d1/platform/pricing/).
Free service does not mean unlimited capacity or guaranteed uptime.

Only `/api/*` invokes the Worker. Avoid routing ordinary assets through the
Worker or requests for gameplay assets could consume the dynamic quota.

### Data and maintenance

Scores contain a generated nickname, mode, start day/version, completion time,
collisions, lives, and submission time. No account or real name is requested.
The host can process request/security logs under its own policies.

Rate-limit keys use a secret-keyed, daily-rotating SHA-256 digest of the network
address. Raw addresses are not persisted by application code. Start, submit,
and board endpoints allow 20, 15, and 90 requests/minute per network identity.
Shared venue Wi-Fi may require careful threshold adjustment. This is basic
abuse deterrence, not a comprehensive DDoS defense.

Accepted run IDs prevent resubmission. Tickets expire after 24 hours; accepted
results are eligible for removal after 30 days. Bounded opportunistic cleanup
runs on API traffic. If there is no traffic, old data remains until the next
cleanup or an operator executes maintenance. Before a long shutdown, clear
expired data using the D1 dashboard. Only an operator may reset the board;
there is no public admin endpoint.

Quota errors disable ranking, not local gameplay. Expired tickets cannot be
renewed for an old result. Submission is opt-in; failed submissions are never
queued for silent background upload.

### QR launch

After confirming the permanent public URL, use your browser's built-in QR
export (where supported) to make a static PNG. No paid QR service is required.
Use black on white, leave a four-module quiet zone, do not cover the code with
a logo, and print the readable URL below it. Verify the **actual exported QR**
using real iPhone and Android camera apps over cellular data at its intended
print size/distance.

Do not distribute a QR pointing to localhost or a private preview: other
phones cannot access this machine's localhost. Static QR codes do not expire
by themselves, but their destination must remain hosted. First-time loading
needs internet. Offline installation/PWA caching is not included.

### Other hosts

`public/` can be served by any static host for **unranked** play. The included
backend is Cloudflare-specific and is not automatically deployed by uploading
files to GitHub Pages, Netlify, Vercel, Firebase, Render, or itch.io. Migrating
it needs appropriate server/database integration; never expose D1 credentials
or the signing secret to browser JavaScript.

GitHub Pages has business-use restrictions; Vercel Hobby is restricted to
personal/non-commercial use. Netlify uses monthly credits; Firebase has a
transfer allowance. A free-to-play promotion is not necessarily non-commercial.
The full planning document compares hosting and QR distribution options.

## Release checklist

- Automated tests and built Worker syntax pass.
- Real iPhone/Android play, swipe/D-pad, rotation, mute, pause/resume, and
  unavailable storage/network are checked.
- At least five informed mobile playthroughs/mode calibrate the median to
  within 20% of the 1/3/5-minute targets; record failures and abandonment too.
- Initial compressed assets remain under 2 MB; measure startup under a
  documented mobile network profile and smoothness on mid-range real devices.
- Verify D1/Worker integration, secrets, quotas, rollback, and score sharing on
  the deployed provider, not just the local SQLite adapter.
- Review character/title/art provenance and publish notices.
- Verify the final public HTTPS URL and QR on both phone families.

Without those gates, this is a playable preview, not a verified public launch.
