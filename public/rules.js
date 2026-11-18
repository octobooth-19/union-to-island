export const VERSION = "1.0.0";
export const COLS = 9;
export const HOP = 0.28;
export const FERRY_TIME = 5;
export const MODES = Object.freeze({
  easy: { label: "Easy", minutes: 1, rows: 78, lives: 5, speed: 1.35, spacing: 5.8, shield: 6, vendorEvery: 13 },
  medium: { label: "Medium", minutes: 3, rows: 234, lives: 3, speed: 1.8, spacing: 5.2, shield: 5, vendorEvery: 26 },
  hard: { label: "Hard", minutes: 5, rows: 390, lives: 2, speed: 2.25, spacing: 4.8, shield: 4, vendorEvery: 39 },
});
export const CHARACTERS = Object.freeze([
  { id: "kit", name: "Kit", species: "Code Cat", color: "#2da44e", detail: "Ships pull requests in a green hoodie" },
  { id: "ducky", name: "Ducky", species: "Debug Duck", color: "#f4c542", detail: "Listens until the bug confesses" },
  { id: "bolt", name: "Bolt", species: "Chat Bot", color: "#9aa7b4", detail: "Automates the boring crossings" },
  { id: "ace", name: "Ace", species: "Co-Pilot", color: "#6e56cf", detail: "Goggles on, suggestions ready" },
]);

export function randomGenerator(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRoute(mode, seed) {
  if (!Object.hasOwn(MODES, mode)) throw new RangeError("Unknown difficulty");
  const config = MODES[mode];
  const random = randomGenerator(seed);
  const route = [];
  const pattern = ["park", "road", "road", "sidewalk", "bike", "sidewalk", "people", "park", "road", "sidewalk", "people", "sidewalk", "park"];
  for (let row = 0; row <= config.rows; row++) {
    const type = row < 4 || row > config.rows - 4 ? "plaza" : pattern[row % pattern.length];
    const hazard = ["road", "bike", "people"].includes(type);
    const direction = random() > 0.5 ? 1 : -1;
    route.push({
      row, type,
      speed: hazard ? direction * config.speed * (type === "bike" ? 1.35 : type === "people" ? 0.48 : 1) : 0,
      spacing: config.spacing + (type === "bike" ? 0.5 : 0),
      offset: random() * config.spacing,
      width: type === "road" ? 1.3 : type === "bike" ? 0.8 : 0.55,
      palette: Math.floor(random() * 4),
      checkpoint: row > 0 && row % 26 === 0,
      vendor: row > 0 && row < config.rows - 4 && row % config.vendorEvery === 0
        ? { kind: (row / config.vendorEvery) % 2 ? "shield" : "heart", x: (row / config.vendorEvery) % 2 ? 2 : 6 }
        : null,
    });
  }
  return route;
}

export function hazardPositions(lane, time) {
  if (!lane.speed) return [];
  const offset = ((lane.offset + time * lane.speed) % lane.spacing + lane.spacing) % lane.spacing;
  const positions = [];
  for (let x = offset - lane.spacing; x < COLS + lane.spacing; x += lane.spacing) positions.push(x);
  return positions;
}

export function locationName(progress) {
  if (progress < 0.12) return "Union Station";
  if (progress < 0.53) return "Bay Street";
  if (progress < 0.78) return "Harbour Street";
  if (progress < 0.95) return "Queens Quay";
  return "Jack Layton Ferry Terminal";
}

export function createRun(mode = "easy", seed = 1, character = "kit") {
  if (!CHARACTERS.some(item => item.id === character)) throw new RangeError("Unknown character");
  const route = createRoute(mode, seed);
  return {
    mode, seed, character, route, status: "running",
    x: 4, row: 0, fromX: 4, fromRow: 0, hopLeft: 0,
    elapsed: 0, ferryElapsed: 0, shieldLeft: 0, immuneLeft: 1,
    lives: MODES[mode].lives, collisions: 0, maxRow: 0, checkpoint: 0,
    usedVendors: new Set(), message: "", messageLeft: 0,
  };
}

export function physicalPosition(run) {
  const mix = run.hopLeft > 0 ? 1 - run.hopLeft / HOP : 1;
  return { x: run.fromX + (run.x - run.fromX) * mix, row: run.fromRow + (run.row - run.fromRow) * mix };
}

export function move(run, dx, dy) {
  if (run.status !== "running" || run.hopLeft > 0.00001 || !Number.isInteger(dx) || !Number.isInteger(dy) || Math.abs(dx) + Math.abs(dy) !== 1) return false;
  const x = run.x + dx;
  const row = run.row + dy;
  if (x < 0 || x >= COLS || row < Math.max(0, run.checkpoint - 3) || row > MODES[run.mode].rows) return false;
  run.fromX = run.x;
  run.fromRow = run.row;
  run.x = x;
  run.row = row;
  run.hopLeft = HOP;
  return true;
}

export function collect(run) {
  if (run.status !== "running" || run.hopLeft > 0) return false;
  const vendor = run.route[run.row].vendor;
  if (!vendor || Math.abs(run.x - vendor.x) > 1 || run.usedVendors.has(run.row)) return false;
  if (vendor.kind === "heart" && run.lives === 5) {
    notify(run, "Lives full. Save this snack for later!");
    return false;
  }
  if (vendor.kind === "shield") {
    run.shieldLeft = MODES[run.mode].shield;
    notify(run, "Shield on! Obstacles can't hurt you.");
  } else {
    run.lives = Math.min(5, run.lives + 1);
    notify(run, "A little Toronto kindness. +1 life!");
  }
  run.usedVendors.add(run.row);
  return true;
}

export function notify(run, message) {
  run.message = message;
  run.messageLeft = 3;
}

// Intersect a moving point with an expanded obstacle in relative coordinates.
export function segmentBox(ax, ay, bx, by, halfWidth, halfHeight) {
  let enter = 0;
  let leave = 1;
  for (const [a, b, half] of [[ax, bx, halfWidth], [ay, by, halfHeight]]) {
    const delta = b - a;
    if (Math.abs(delta) < 1e-10) {
      if (Math.abs(a) > half) return false;
    } else {
      const first = (-half - a) / delta;
      const second = (half - a) / delta;
      enter = Math.max(enter, Math.min(first, second));
      leave = Math.min(leave, Math.max(first, second));
      if (enter > leave) return false;
    }
  }
  return true;
}

function step(run, dt) {
  run.elapsed += dt;
  run.messageLeft = Math.max(0, run.messageLeft - dt);
  if (run.status === "ferry") {
    run.ferryElapsed += dt;
    if (run.ferryElapsed >= FERRY_TIME) run.status = "won";
    return;
  }
  const before = physicalPosition(run);
  const shielded = run.shieldLeft > 0 || run.immuneLeft > 0;
  run.shieldLeft = Math.max(0, run.shieldLeft - dt);
  run.immuneLeft = Math.max(0, run.immuneLeft - dt);
  run.hopLeft = Math.max(0, run.hopLeft - dt);
  const after = physicalPosition(run);
  if (!shielded) {
    const bottom = Math.max(0, Math.floor(Math.min(before.row, after.row) - 1));
    const top = Math.min(run.route.length - 1, Math.ceil(Math.max(before.row, after.row) + 1));
    for (let row = bottom; row <= top; row++) {
      const lane = run.route[row];
      for (const x of hazardPositions(lane, run.elapsed - dt)) {
        if (segmentBox(before.x - x, before.row - row, after.x - (x + lane.speed * dt), after.row - row, lane.width / 2 + 0.22, 0.43)) {
          run.collisions++;
          run.lives--;
          run.hopLeft = 0;
          run.x = run.fromX = 4;
          run.row = run.fromRow = run.checkpoint;
          run.immuneLeft = 1.5;
          notify(run, run.lives ? "Whoops! Back to your last safe stop." : "Out of lives. The island will be here for your next trip.");
          if (!run.lives) run.status = "lost";
          return;
        }
      }
    }
  }
  if (run.hopLeft === 0) {
    run.maxRow = Math.max(run.maxRow, run.row);
    if (run.route[run.row].checkpoint && run.row > run.checkpoint) {
      run.checkpoint = run.row;
      notify(run, "Safe stop reached. Take a breath.");
    }
    if (run.row === MODES[run.mode].rows) {
      run.status = "ferry";
      run.shieldLeft = 0;
      notify(run, "All aboard! Next stop: Toronto Island.");
    }
  }
}

export function tick(run, seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError("Invalid simulation time");
  if (!["running", "ferry"].includes(run.status)) return;
  let remaining = Math.min(seconds, 10);
  while (remaining > 1e-8 && ["running", "ferry"].includes(run.status)) {
    const dt = Math.min(remaining, 1 / 60);
    step(run, dt);
    remaining -= dt;
  }
}
