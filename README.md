# Union to Island

An original, dependency-free Toronto crossing game: choose Kit the Code Cat,
Ducky the Debug Duck, Bolt the Chat Bot, or Ace the Co-Pilot (original
characters styled after GitHub-type developer mascots), then travel from Union
Station to Toronto Island. Cross cars, bikes, and pedestrians; visit striped
vendor carts for a shield or an extra life; board the ferry to win.

**Team:** Yelizaveta Brus, Sarah Khan, and Trish Nguyen.

## Play now

**Live (free, GitHub Pages):** <https://octobooth-19.github.io/union-to-island/>

The `.github/workflows/pages.yml` workflow republishes `public/` on every push
to `main`. The leaderboard is stored in each player's browser; it is not
shared between players or devices. No Cloudflare account or backend is needed.

The [print-ready QR code](https://raw.githubusercontent.com/octobooth-19/union-to-island/main/union-to-island-qr.png)
encodes the GitHub Pages URL above and includes a four-module white border. Verify
it with real phones at its intended print size. To generate another code, use
CoreImage's `CIQRCodeGenerator` on macOS or Chrome's **Share → Create QR code**
on the deployed page.

## Run locally

Use **Node.js 22.13+**. No package installation or build is needed for local play.

```sh
node scripts/serve.js
```

Open <http://127.0.0.1:4173>. The local leaderboard is saved in that browser's
storage, not on the development server. Browser storage is isolated by site
address, so scores from localhost are separate from scores on GitHub Pages.

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
menus, and pauses. Each winning trip is automatically considered for the
all-time local top 20 for its difficulty. Rankings use completion time, then
bumps, then completion order. Entries show the chosen character and date.
Each trip has a randomly generated route.

Scores and settings stay in the current browser and are not uploaded or shared.
Clearing browser data or using private browsing can remove them. If browser
storage is unavailable, the game says so and keeps scores only until the tab
is closed. Personal-best times from the previous version remain visible;
the new detailed leaderboard begins with trips completed after this update.

## Verify and package

```sh
node --test
node scripts/build.js
```

Tests cover local score persistence and game simulation. The route solver checks
full successful trips without boosts; it is a test driver and is not shipped
with the frontend. The previous shared leaderboard backend and its tests remain
in the repository for possible future work, but the game, development server,
and static build do not use it.

`dist/` contains the static game and optional security headers. It does not
include a Worker or require runtime packages.

## QR launch

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

## Other hosts

`public/` can be served by any static host, including GitHub Pages, Netlify,
Vercel, Firebase, Render, or itch.io. All use the same per-browser leaderboard;
a shared public leaderboard would require new backend integration. Free plans
have usage limits and can change.

GitHub Pages has business-use restrictions; Vercel Hobby is restricted to
personal/non-commercial use. Netlify uses monthly credits; Firebase has a
transfer allowance. A free-to-play promotion is not necessarily non-commercial.
The full planning document compares hosting and QR distribution options.

## Release checklist

- Automated tests and the static build pass.
- Real iPhone/Android play, swipe/D-pad, rotation, mute, pause/resume, and
  unavailable storage/network are checked.
- At least five informed mobile playthroughs/mode calibrate the median to
  within 20% of the 1/3/5-minute targets; record failures and abandonment too.
- Initial compressed assets remain under 2 MB; measure startup under a
  documented mobile network profile and smoothness on mid-range real devices.
- Verify local scores persist in each browser and are not shared across devices.
- Review character/title/art provenance and publish notices.
- Verify the final public HTTPS URL and QR on both phone families.

Without those gates, this is a playable preview, not a verified public launch.
