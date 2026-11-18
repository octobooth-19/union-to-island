import { CHARACTERS, MODES } from "./rules.js?v=1.2";

const STORAGE_KEY = "union-leaderboard-v1";
const LIMIT = 20;

function emptyScores() {
  return Object.fromEntries(Object.keys(MODES).map(mode => [mode, []]));
}

function isScore(score) {
  return score && typeof score === "object" && !Array.isArray(score)
    && CHARACTERS.some(character => character.id === score.character)
    && Number.isSafeInteger(score.elapsed) && score.elapsed > 0
    && Number.isSafeInteger(score.collisions) && score.collisions >= 0
    && Number.isInteger(score.lives) && score.lives >= 1 && score.lives <= 5
    && Number.isSafeInteger(score.completedAt) && score.completedAt >= 0
    && score.completedAt <= 8640000000000000;
}

function compareScores(a, b) {
  return a.elapsed - b.elapsed || a.collisions - b.collisions || a.completedAt - b.completedAt;
}

function readScores(raw) {
  if (raw === null) return emptyScores();
  const saved = JSON.parse(raw);
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) throw new Error("Invalid saved leaderboard");
  const scores = emptyScores();
  for (const mode of Object.keys(scores)) {
    if (!Array.isArray(saved[mode]) || !saved[mode].every(isScore)) throw new Error("Invalid saved leaderboard");
    scores[mode] = saved[mode].map(({ character, elapsed, collisions, lives, completedAt }) =>
      ({ character, elapsed, collisions, lives, completedAt })).sort(compareScores).slice(0, LIMIT);
  }
  return scores;
}

export function createLeaderboard(getStorage = () => globalThis.localStorage, onError = error => console.warn("Local leaderboard unavailable:", error)) {
  let scores = emptyScores();
  let storage;
  let persistent = true;

  function fail(error) {
    persistent = false;
    onError(error);
  }

  function refresh() {
    if (!persistent) return;
    try { scores = readScores(storage.getItem(STORAGE_KEY)); }
    catch (error) { fail(error); }
  }

  try {
    storage = getStorage();
    if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
      throw new Error("Browser storage is unavailable");
    }
    refresh();
  } catch (error) { fail(error); }

  function checkMode(mode) {
    if (!Object.hasOwn(MODES, mode)) throw new RangeError("Unknown difficulty");
  }

  return {
    get persistent() { return persistent; },
    entries(mode) {
      checkMode(mode);
      refresh();
      return scores[mode].map(score => ({ ...score }));
    },
    add(mode, score) {
      checkMode(mode);
      if (!isScore(score)) throw new RangeError("Invalid winning score");
      refresh();
      const { character, elapsed, collisions, lives, completedAt } = score;
      const entry = { character, elapsed, collisions, lives, completedAt };
      const ranked = [...scores[mode], entry].sort(compareScores);
      const index = ranked.indexOf(entry);
      const rank = index < LIMIT ? index + 1 : null;
      if (rank !== null) {
        scores[mode] = ranked.slice(0, LIMIT);
        if (persistent) {
          try { storage.setItem(STORAGE_KEY, JSON.stringify(scores)); }
          catch (error) { fail(error); }
        }
      }
      return { rank, persistent };
    },
  };
}
