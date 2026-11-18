import { createRun, move, tick, MODES } from "../public/rules.js";

export const FRAMES_PER_ACTION = 17;
const STEP = FRAMES_PER_ACTION / 60;

// A test driver, not a game feature: search real simulation transitions without boosts.
export function solveSection(initial, endRow) {
  let frontier = [{ state: initial, previous: null, action: null }];
  for (let frame = 0; frame < 130; frame++) {
    const next = new Map();
    for (const node of frontier) {
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, 0], [0, -1]]) {
        const state = { ...node.state, usedVendors: new Set(node.state.usedVendors) };
        if (dy < 0 && state.row <= initial.row) continue;
        if (state.row + dy > endRow) continue;
        if ((dx || dy) && !move(state, dx, dy)) continue;
        tick(state, STEP);
        if (state.collisions !== initial.collisions || state.status === "lost") continue;
        const child = { state, previous: node, action: [dx, dy] };
        if (state.row === endRow && state.hopLeft === 0) {
          const actions = [];
          for (let item = child; item.previous; item = item.previous) actions.unshift(item.action);
          return { state, actions };
        }
        const key = `${state.x}:${state.row}`;
        if (!next.has(key)) next.set(key, child);
      }
    }
    frontier = [...next.values()];
    if (!frontier.length) break;
  }
  throw new Error(`No path in ${initial.mode} seed ${initial.seed}: ${initial.row} to ${endRow}`);
}

export function solveRoute(mode, seed) {
  let state = createRun(mode, seed);
  const actions = [];
  while (state.row < MODES[mode].rows) {
    const result = solveSection(state, Math.min(MODES[mode].rows, state.row + 13));
    state = result.state;
    actions.push(...result.actions);
  }
  return { state, actions };
}
