import test from "node:test";
import assert from "node:assert/strict";
import { MODES, HOP, FERRY_TIME, createRun, createRoute, move, tick, collect, segmentBox, hazardPositions, physicalPosition } from "../public/rules.js";
import { solveRoute } from "../scripts/route-solver.js";

test("one orthogonal hop, world boundaries, and cosmetic characters", () => {
  const run = createRun("easy", 1, "ace");
  assert.equal(move(run, 1, 1), false);
  assert.equal(move(run, 0.5, 0.5), false);
  assert.equal(move(run, 0, -1), false);
  assert.equal(move(run, 0, 1), true);
  assert.equal(move(run, 0, 1), false);
  tick(run, HOP);
  assert.equal(run.row, 1);
  assert.equal(run.hopLeft, 0);
  assert.deepEqual(physicalPosition(run), { x: 4, row: 1 });
  assert.equal(createRun("easy", 1, "bolt").lives, run.lives);
  run.x = 0;
  assert.equal(move(run, -1, 0), false);
});

function roadFixture() {
  const run = createRun("easy", 22);
  run.immuneLeft = 0;
  run.row = run.fromRow = 5;
  run.route[5] = { row: 5, type: "road", speed: 10, spacing: 100, offset: 3, width: 1.3 };
  return run;
}

test("swept collisions detect fast obstacles and only remove one life per contact", () => {
  assert.equal(segmentBox(-4, 0, 4, 0, 0.6, 0.43), true);
  assert.equal(segmentBox(-4, 1, 4, 1, 0.6, 0.43), false);
  const run = roadFixture();
  tick(run, 0.2);
  assert.equal(run.lives, 4);
  assert.equal(run.collisions, 1);
  assert.equal(run.row, 0);
  tick(run, 0.2);
  assert.equal(run.lives, 4);
});

test("shield protects, expires, and cannot be farmed by revisiting carts", () => {
  const run = createRun("easy", 4);
  run.x = run.fromX = 2; run.row = run.fromRow = 13;
  assert.equal(collect(run), true);
  assert.equal(run.shieldLeft, 6);
  assert.equal(collect(run), false);
  run.immuneLeft = 0;
  run.route[13].speed = 0.01; run.route[13].offset = 2; run.route[13].width = 1.3; run.route[13].spacing = 100;
  tick(run, 1);
  assert.equal(run.lives, 5);
  assert.ok(Math.abs(run.shieldLeft - 5) < 0.001);
  run.row = run.fromRow = 0;
  tick(run, 6);
  assert.equal(run.shieldLeft, 0);
  run.row = run.fromRow = 13;
  assert.equal(collect(run), false);
});

test("heart cap preserves an unused cart; checkpoints preserve vendor consumption", () => {
  const run = createRun("easy", 5);
  run.row = run.fromRow = 26; run.x = run.fromX = 6;
  assert.equal(collect(run), false);
  assert.equal(run.usedVendors.size, 0);
  run.lives = 4;
  assert.equal(collect(run), true);
  assert.equal(run.lives, 5);
  tick(run, 0.01);
  assert.equal(run.checkpoint, 26);
  run.lives = 3;
  assert.equal(collect(run), false);
  assert.equal(run.lives, 3);
});

test("refreshing another shield does not stack duration", () => {
  const run = createRun("easy", 4);
  run.x = run.fromX = 2; run.row = run.fromRow = 13;
  collect(run);
  tick(run, 2);
  run.row = run.fromRow = 39;
  assert.equal(collect(run), true);
  assert.equal(run.shieldLeft, MODES.easy.shield);
});

test("the ferry terminal is not victory: island arrival is required", () => {
  const run = createRun("easy", 9);
  run.row = run.fromRow = MODES.easy.rows - 1;
  move(run, 0, 1);
  tick(run, HOP + 0.01);
  assert.equal(run.status, "ferry");
  tick(run, FERRY_TIME - 0.1);
  assert.equal(run.status, "ferry");
  tick(run, 0.2);
  assert.equal(run.status, "won");
  const time = run.elapsed;
  tick(run, 1);
  assert.equal(run.elapsed, time);
});

test("paused and lost runs do not advance timers or accept movement", () => {
  const run = createRun();
  run.status = "paused";
  tick(run, 3);
  assert.equal(run.elapsed, 0);
  assert.equal(move(run, 0, 1), false);
  run.status = "lost";
  assert.equal(collect(run), false);
  assert.throws(() => tick(run, NaN), RangeError);
});

test("route seeds are repeatable and every vendor/checkpoint is on safe ground", () => {
  for (const mode of Object.keys(MODES)) {
    assert.deepEqual(createRoute(mode, 63), createRoute(mode, 63));
    for (const row of createRoute(mode, 63)) {
      if (row.vendor || row.checkpoint) assert.equal(row.speed, 0);
    }
  }
  assert.throws(() => createRoute("impossible", 1), RangeError);
});

// Search movement and waiting in space-time across each small crossing template.
function crossingReachable(route, begin, end, startTime, config) {
  const step = HOP;
  let frontier = new Set(["4,0"]);
  const safe = (x, row, time, previousX, previousRow) => {
    for (let n = 1; n <= 6; n++) {
      const t = n / 6;
      const px = previousX + (x - previousX) * t;
      const py = previousRow + (row - previousRow) * t;
      for (let laneRow = Math.max(begin, Math.floor(py)); laneRow <= Math.min(end, Math.ceil(py)); laneRow++) {
        const lane = route[laneRow];
        if (Math.abs(py - laneRow) > 0.43) continue;
        if (hazardPositions(lane, time - step + step * t).some(hx => Math.abs(hx - px) < lane.width / 2 + 0.24)) return false;
      }
    }
    return true;
  };
  for (let frame = 1; frame < 110; frame++) {
    const next = new Set();
    for (const key of frontier) {
      const [x, offset] = key.split(",").map(Number);
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1]]) {
        const nx = x + dx, ny = begin + offset + dy;
        if (nx < 0 || nx >= 9 || ny > end || !safe(nx, ny, startTime + frame * step, x, begin + offset)) continue;
        if (ny === end) return true;
        next.add(`${nx},${ny - begin}`);
      }
    }
    frontier = next;
    if (!frontier.size) return false;
  }
  return false;
}

test("representative generated crossings have a timed path without shields", () => {
  for (const [mode, config] of Object.entries(MODES)) {
    for (const seed of [1, 17, 2811, 987654]) {
      const route = createRoute(mode, seed);
      for (let begin = 0; begin + 13 <= config.rows; begin += 26) {
        assert.ok(crossingReachable(route, begin, begin + 13, begin * 0.7, config), `${mode} seed ${seed} rows ${begin}-${begin + 13}`);
      }
    }
  }
});

test("full routes on all modes can reach the island without collisions or vendors", () => {
  for (const mode of Object.keys(MODES)) {
    const { state } = solveRoute(mode, 2811);
    assert.equal(state.status, "ferry", mode);
    tick(state, FERRY_TIME + 0.1);
    assert.equal(state.status, "won", mode);
    assert.equal(state.collisions, 0);
    assert.equal(state.usedVendors.size, 0);
  }
});
