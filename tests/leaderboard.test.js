import test from "node:test";
import assert from "node:assert/strict";
import { createLeaderboard } from "../public/leaderboard.js";

function memoryStorage() {
  const data = new Map();
  return {
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, value),
  };
}

function score(elapsed, overrides = {}) {
  return { character: "kit", elapsed, collisions: 0, lives: 5, completedAt: 100, ...overrides };
}

test("local leaderboard ranks winning trips separately by difficulty and keeps the best 20", () => {
  const storage = memoryStorage();
  const board = createLeaderboard(() => storage);
  assert.deepEqual(board.add("easy", score(50000, { collisions: 1 })), { rank: 1, persistent: true });
  board.add("easy", score(50000, { completedAt: 101 }));
  board.add("medium", score(40000));
  assert.deepEqual(board.entries("easy").map(item => item.collisions), [0, 1]);
  assert.equal(board.entries("medium").length, 1);
  assert.deepEqual(board.entries("hard"), []);
  for (let i = 0; i < 20; i++) board.add("easy", score(60000 + i));
  assert.equal(board.entries("easy").length, 20);
  assert.deepEqual(board.add("easy", score(90000)), { rank: null, persistent: true });
  assert.equal(board.entries("easy").at(-1).elapsed, 60017);
});

test("scores persist, ties favor the earlier trip, and another tab's results are retained", () => {
  const storage = memoryStorage();
  const first = createLeaderboard(() => storage);
  const second = createLeaderboard(() => storage);
  first.add("hard", score(65000, { character: "bolt", completedAt: 200 }));
  second.add("hard", score(65000, { character: "ducky", completedAt: 100 }));
  first.add("hard", score(70000, { character: "ace", completedAt: 300 }));
  const reloaded = createLeaderboard(() => storage);
  assert.deepEqual(reloaded.entries("hard").map(item => item.character), ["ducky", "bolt", "ace"]);
  const entries = reloaded.entries("hard");
  entries[0].character = "kit";
  assert.equal(reloaded.entries("hard")[0].character, "ducky");
});

test("storage access and write failures keep scores for the visit and report the failure", () => {
  const errors = [];
  const unavailable = createLeaderboard(() => { throw new Error("blocked"); }, error => errors.push(error.message));
  assert.equal(unavailable.persistent, false);
  assert.deepEqual(unavailable.add("easy", score(45000)), { rank: 1, persistent: false });
  assert.equal(unavailable.entries("easy").length, 1);

  const storage = memoryStorage();
  createLeaderboard(() => storage).add("easy", score(50000));
  const board = createLeaderboard(() => storage, error => errors.push(error.message));
  storage.setItem = () => { throw new Error("quota"); };
  assert.deepEqual(board.add("easy", score(40000)), { rank: 1, persistent: false });
  assert.deepEqual(board.entries("easy").map(item => item.elapsed), [40000, 50000]);
  assert.deepEqual(createLeaderboard(() => storage).entries("easy").map(item => item.elapsed), [50000]);
  assert.deepEqual(errors, ["blocked", "quota"]);
});

test("invalid saved data is not overwritten, and invalid new scores are rejected", () => {
  const storage = memoryStorage();
  storage.setItem("union-leaderboard-v1", "{invalid");
  const errors = [];
  const board = createLeaderboard(() => storage, error => errors.push(error.message));
  assert.equal(board.persistent, false);
  board.add("easy", score(45000));
  assert.equal(storage.getItem("union-leaderboard-v1"), "{invalid");
  assert.equal(errors.length, 1);
  assert.throws(() => board.add("easy", score(-1)), /Invalid winning score/);
  assert.throws(() => board.add("unknown", score(1000)), /Unknown difficulty/);
  assert.equal(board.entries("easy").length, 1);
});
