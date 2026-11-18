import { COLS, HOP, FERRY_TIME, MODES, CHARACTERS, createRun, move, collect, tick, physicalPosition, hazardPositions, locationName } from "./rules.js?v=1.2";
import { createLeaderboard } from "./leaderboard.js?v=1.2";

const $ = selector => document.querySelector(selector);
const canvas = $("#game");
const ctx = canvas.getContext("2d");
const stage = $("#stage");
const dialog = $("#modal");
const content = $("#modal-content");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
let storage = true;
let prefs = {};
try { prefs = JSON.parse(localStorage.getItem("union-prefs") || "{}"); } catch (error) {
  storage = false;
  console.warn("Local preferences are unavailable:", error.message);
}
if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) prefs = {};
let character = CHARACTERS.some(c => c.id === prefs.character) ? prefs.character : "kit";
let mode = Object.hasOwn(MODES, prefs.mode) ? prefs.mode : "easy";
const leaderboard = createLeaderboard();
let run = null;
let active = false;
let ended = false;
let lastFrame = 0;
let accumulator = 0;
let camera = 0;
let viewWidth = 0;
let viewHeight = 0;
let animationTime = 0;
let audio = null;
let sound = !!prefs.sound;
let pointer = null;
let buffer = null;
let resultNotice = "";
let modalKind = "";
let uiSecond = -1;
const terrain = { road: "#747d78", bike: "#b1c8b3", sidewalk: "#dfdfce", people: "#d8d9c7", park: "#bdd1a6", plaza: "#e5e0cb" };
const carColors = ["#e6ae60", "#d17965", "#e7e6d4", "#698f8b"];
const demoRoute = createRun("easy", 2811).route;

function savePrefs() {
  prefs = { ...prefs, character, mode, sound };
  if (!storage) return;
  try { localStorage.setItem("union-prefs", JSON.stringify(prefs)); } catch (error) {
    storage = false;
    console.warn("Could not save local preferences:", error.message);
    if (run) { run.message = "Could not save your settings in this browser."; run.messageLeft = 4; }
  }
}

function round(x, y, width, height, radius, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
}

function ellipse(x, y, rx, ry, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function polygon(points, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
  ctx.fill();
}

function text(value, x, y, size, color, weight = "600", align = "center") {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.fillText(value, x, y);
}

function animal(id, x, y, size, hop = 0, protectedState = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  ellipse(0, 0.12, 0.35, 0.12, "#21352c23");
  ctx.translate(0, -hop);
  if (protectedState) {
    ellipse(0, -0.3, 0.51, 0.63, "#83d3c64d");
    ctx.strokeStyle = "#d2fff5";
    ctx.lineWidth = 0.045;
    ctx.beginPath(); ctx.ellipse(0, -0.3, 0.51, 0.63, 0, 0, Math.PI * 2); ctx.stroke();
  }
  let defaultEyes = true;
  if (id === "ducky") {
    ellipse(0.02, -0.16, 0.32, 0.27, "#f4c542");
    polygon([[0.26, -0.3], [0.42, -0.42], [0.3, -0.18]], "#f4c542");
    ellipse(-0.08, -0.18, 0.15, 0.1, "#e3ac2c");
    round(-0.16, 0.0, 0.09, 0.08, 0.03, "#e7873a");
    round(0.08, 0.0, 0.09, 0.08, 0.03, "#e7873a");
    ellipse(0, -0.58, 0.25, 0.25, "#f7cf55");
    ellipse(0, -0.48, 0.15, 0.06, "#e7873a");
    ellipse(0, -0.45, 0.12, 0.04, "#cf6f2a");
    polygon([[-0.22, -0.37], [0.22, -0.37], [0, -0.26]], "#3b6fb6");
    ellipse(-0.17, -0.5, 0.05, 0.03, "#f2a48f");
    ellipse(0.17, -0.5, 0.05, 0.03, "#f2a48f");
  } else if (id === "bolt") {
    defaultEyes = false;
    round(-0.24, -0.34, 0.48, 0.36, 0.08, "#9aa7b4");
    round(-0.15, -0.28, 0.3, 0.2, 0.04, "#2f3d4a");
    text("< >", 0, -0.13, 0.12, "#7fe3d4", "700");
    round(-0.2, -0.02, 0.13, 0.12, 0.03, "#5b6977");
    round(0.07, -0.02, 0.13, 0.12, 0.03, "#5b6977");
    round(-0.34, -0.3, 0.1, 0.22, 0.04, "#7d8a97");
    round(0.24, -0.3, 0.1, 0.22, 0.04, "#7d8a97");
    ctx.strokeStyle = "#5b6977"; ctx.lineWidth = 0.035;
    ctx.beginPath(); ctx.moveTo(0, -0.84); ctx.lineTo(0, -0.97); ctx.stroke();
    ellipse(0, -0.99, 0.05, 0.05, "#e5625c");
    round(-0.3, -0.85, 0.6, 0.48, 0.14, "#c4ced8");
    round(-0.24, -0.72, 0.48, 0.18, 0.09, "#24313d");
    ellipse(-0.11, -0.63, 0.055, 0.05, "#7fe3d4");
    ellipse(0.11, -0.63, 0.055, 0.05, "#7fe3d4");
    round(-0.09, -0.48, 0.18, 0.04, 0.02, "#7d8a97");
  } else if (id === "ace") {
    defaultEyes = false;
    round(-0.25, -0.34, 0.5, 0.36, 0.14, "#6e56cf");
    polygon([[-0.2, -0.36], [0.2, -0.36], [0.26, -0.18], [0.04, -0.27]], "#e5625c");
    round(-0.2, -0.02, 0.13, 0.12, 0.04, "#3f2f86");
    round(0.07, -0.02, 0.13, 0.12, 0.04, "#3f2f86");
    ellipse(0, -0.6, 0.31, 0.28, "#1f2430");
    ellipse(-0.3, -0.58, 0.07, 0.1, "#6e56cf");
    ellipse(0.3, -0.58, 0.07, 0.1, "#6e56cf");
    round(-0.27, -0.73, 0.54, 0.05, 0.02, "#8f7a5a");
    round(-0.25, -0.72, 0.23, 0.18, 0.08, "#b9a37a");
    round(0.02, -0.72, 0.23, 0.18, 0.08, "#b9a37a");
    round(-0.21, -0.68, 0.16, 0.11, 0.05, "#bfeaf5");
    round(0.06, -0.68, 0.16, 0.11, 0.05, "#bfeaf5");
    ellipse(-0.12, -0.62, 0.03, 0.035, "#1c3432");
    ellipse(0.12, -0.62, 0.03, 0.035, "#1c3432");
    ctx.strokeStyle = "#e9edf5"; ctx.lineWidth = 0.03;
    ctx.beginPath(); ctx.arc(0, -0.47, 0.08, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  } else {
    ctx.strokeStyle = "#2b2f36"; ctx.lineWidth = 0.08; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(0.2, -0.08); ctx.quadraticCurveTo(0.45, -0.1, 0.38, -0.36); ctx.stroke();
    round(-0.25, -0.36, 0.5, 0.38, 0.14, "#2da44e");
    round(-0.11, -0.2, 0.22, 0.1, 0.04, "#238636");
    text("{ }", 0, -0.1, 0.1, "#dafbe1", "700");
    round(-0.2, -0.02, 0.13, 0.12, 0.05, "#2b2f36");
    round(0.07, -0.02, 0.13, 0.12, 0.05, "#2b2f36");
    polygon([[-0.29, -0.62], [-0.27, -0.92], [-0.08, -0.79]], "#2b2f36");
    polygon([[0.29, -0.62], [0.27, -0.92], [0.08, -0.79]], "#2b2f36");
    ellipse(0, -0.59, 0.31, 0.27, "#2b2f36");
    ellipse(0, -0.55, 0.23, 0.17, "#f3cdb6");
    ellipse(0, -0.48, 0.035, 0.025, "#c97a6a");
    ellipse(-0.17, -0.5, 0.045, 0.025, "#f0a993");
    ellipse(0.17, -0.5, 0.045, 0.025, "#f0a993");
  }
  if (defaultEyes) {
    ellipse(-0.12, -0.61, 0.025, 0.037, "#1c3432");
  ellipse(0.12, -0.61, 0.025, 0.037, "#1c3432");
  ellipse(-0.127, -0.62, 0.008, 0.012, "#fffdf1");
  ellipse(0.113, -0.62, 0.008, 0.012, "#fffdf1");
  }
  ctx.restore();
}

function tree(x, y, size = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(size, size);
  ellipse(0.13, 0.08, 0.36, 0.17, "#46674422");
  round(-0.055, -0.6, 0.11, 0.63, 0.02, "#8d805a");
  ellipse(0, -0.65, 0.36, 0.42, "#759765");
  ellipse(-0.13, -0.77, 0.25, 0.3, "#86a873");
  ellipse(0.14, -0.67, 0.22, 0.27, "#6d905c");
  ctx.restore();
}

function car(x, y, tile, color, direction) {
  ctx.save(); ctx.translate(x, y); ctx.scale(tile * direction, tile);
  round(-0.67, -0.13, 1.4, 0.52, 0.1, "#273e3830");
  round(-0.48, -0.43, 0.18, 0.16, 0.04, "#3b4741");
  round(0.32, -0.43, 0.18, 0.16, 0.04, "#3b4741");
  round(-0.48, 0.22, 0.18, 0.16, 0.04, "#3b4741");
  round(0.32, 0.22, 0.18, 0.16, 0.04, "#3b4741");
  round(-0.67, -0.44, 1.33, 0.76, 0.13, color);
  round(-0.2, -0.4, 0.52, 0.67, 0.1, "#ffffff28");
  round(0.2, -0.32, 0.17, 0.49, 0.04, "#456568");
  round(-0.36, -0.32, 0.14, 0.49, 0.04, "#506d6b");
  round(0.55, -0.29, 0.08, 0.13, 0.02, "#fff5c3");
  round(0.55, 0.09, 0.08, 0.13, 0.02, "#fff5c3");
  round(-0.65, -0.25, 0.06, 0.1, 0.01, "#ad6453");
  round(-0.65, 0.07, 0.06, 0.1, 0.01, "#ad6453");
  ctx.restore();
}

function pedestrian(x, y, tile, palette, time) {
  ctx.save(); ctx.translate(x, y); ctx.scale(tile, tile);
  ellipse(0.04, 0.1, 0.22, 0.1, "#273e3825");
  const stride = reducedMotion ? 0 : Math.sin(time * 10) * 0.055;
  round(-0.13, -0.12 + stride, 0.09, 0.25, 0.03, "#4c5d56");
  round(0.04, -0.12 - stride, 0.09, 0.25, 0.03, "#4c5d56");
  round(-0.2, -0.48, 0.4, 0.42, 0.1, ["#af775f", "#6e8e87", "#d4ad67", "#86819e"][palette]);
  ellipse(0, -0.55, 0.16, 0.17, ["#d8b58b", "#af8167", "#e8c9a1", "#bc8c6b"][palette]);
  ellipse(-0.01, -0.62, 0.17, 0.1, "#545b4b");
  ctx.restore();
}

function bike(x, y, tile, direction, time) {
  ctx.save(); ctx.translate(x, y); ctx.scale(tile * direction, tile);
  ctx.strokeStyle = "#3e5952"; ctx.lineWidth = 0.045;
  for (const wheel of [-0.29, 0.29]) { ctx.beginPath(); ctx.ellipse(wheel, 0.03, 0.17, 0.13, 0, 0, Math.PI * 2); ctx.stroke(); }
  ctx.strokeStyle = "#cb845b";
  ctx.beginPath(); ctx.moveTo(-0.29, 0.02); ctx.lineTo(-0.02, -0.3); ctx.lineTo(0.29, 0.02); ctx.lineTo(-0.29, 0.02); ctx.stroke();
  pedestrian(-0.06, -0.13, 0.75, 1, time);
  ellipse(0.03, -0.65, 0.15, 0.08, "#e5b96f");
  ctx.restore();
}

function vendor(x, y, tile, kind, used) {
  ctx.save(); ctx.translate(x, y); ctx.scale(tile, tile);
  if (used) ctx.globalAlpha = 0.52;
  ellipse(0.1, 0.3, 0.65, 0.17, "#36523d22");
  round(-0.54, -0.28, 1.08, 0.54, 0.04, "#f3e7c7");
  round(-0.54, -0.02, 1.08, 0.25, 0.02, "#d8b77c");
  for (const wheel of [-0.35, 0.35]) ellipse(wheel, 0.29, 0.095, 0.1, "#5e6950");
  ctx.fillStyle = "#8b8963"; ctx.fillRect(-0.47, -1.03, 0.04, 0.8); ctx.fillRect(0.43, -1.03, 0.04, 0.8);
  polygon([[-0.63, -0.69], [0.63, -0.69], [0.45, -1.06], [-0.45, -1.06]], "#f7e9ca");
  for (let i = 0; i < 6; i += 2) polygon([[-0.63 + i * 0.21, -0.69], [-0.42 + i * 0.21, -0.69], [-0.3 + i * 0.15, -1.06], [-0.45 + i * 0.15, -1.06]], "#d78d69");
  round(-0.64, -0.71, 1.28, 0.13, 0.02, "#f6e8c7");
  for (let i = 0; i < 6; i += 2) round(-0.64 + i * 0.213, -0.71, 0.213, 0.13, 0.02, "#d78d69");
  text(used ? "THANKS!" : kind === "heart" ? "+1 LIFE" : "SHIELD", 0, 0.1, 0.14, "#715e40", "700");
  if (!used) {
    ellipse(0.65, -0.9, 0.23, 0.23, kind === "heart" ? "#fbf1db" : "#d6ece0");
    text(kind === "heart" ? "+" : "S", 0.65, -0.82, 0.23, kind === "heart" ? "#ce7f58" : "#487b62");
  }
  ctx.restore();
}

function station(x, y, tile) {
  ctx.save(); ctx.translate(x, y); ctx.scale(tile, tile);
  round(-4.05, -1.1, 8.2, 1.55, 0.08, "#7f8e731a");
  round(-4.1, -1.3, 8.2, 1.45, 0.03, "#c8bea0");
  round(-4.25, -1.4, 8.5, 0.18, 0.02, "#ddd2b1");
  round(-4.35, -1.48, 8.7, 0.12, 0.02, "#a59e83");
  polygon([[-1.35, -1.5], [0, -1.95], [1.35, -1.5]], "#d8cba7");
  text("UNION STATION", 0, -0.97, 0.2, "#5d644f", "700");
  for (let i = -3; i <= 3; i++) {
    round(i - 0.27, -0.72, 0.54, 0.82, 0.02, "#76877e");
    round(i - 0.31, -0.75, 0.08, 0.94, 0.01, "#ece1bf");
    round(i + 0.24, -0.75, 0.08, 0.94, 0.01, "#ece1bf");
    round(i - 0.05, -0.7, 0.04, 0.77, 0.01, "#bdb69c");
  }
  round(-4.3, 0.1, 8.6, 0.13, 0.01, "#e0d6b8");
  ctx.restore();
}

function ferry(x, y, tile) {
  ctx.save(); ctx.translate(x, y); ctx.scale(tile, tile);
  ellipse(0.2, 0.25, 1.3, 0.23, "#70b4a438");
  polygon([[-1.2, 0], [1.25, 0], [0.9, 0.5], [-0.95, 0.5]], "#f7f0d7");
  round(-0.9, -0.65, 1.65, 0.69, 0.06, "#f2ecd3");
  round(-1.04, -0.74, 1.92, 0.12, 0.025, "#c77e60");
  for (let i = 0; i < 5; i++) round(-0.72 + i * 0.29, -0.48, 0.18, 0.26, 0.025, "#7fa89c");
  round(-0.38, -1.12, 0.56, 0.4, 0.02, "#e5ddbe");
  round(-0.15, -1.44, 0.16, 0.32, 0.02, "#4a6b60");
  ctx.fillStyle = "#d28562"; ctx.fillRect(0.3, -1.36, 0.035, 0.7);
  polygon([[0.33, -1.35], [0.65, -1.28], [0.33, -1.17]], "#ce8060");
  round(-1, 0.14, 1.98, 0.09, 0.02, "#548575");
  ctx.restore();
}

function drawWater(width, height, time) {
  ctx.fillStyle = "#a9cdbf"; ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#d5e7d0"; ctx.lineWidth = 1.5;
  for (let row = 0; row < height / 23; row++) {
    for (let col = -1; col < width / 60; col++) {
      const x = col * 70 + Math.sin(row * 2) * 30 + (reducedMotion ? 0 : Math.sin(time * 0.4 + row) * 5);
      const y = row * 25 + 8;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 10, y + 3, x + 23, y); ctx.stroke();
    }
  }
}

function drawIsland(width, y, tile) {
  ellipse(width * 0.5, y + tile * 0.3, tile * 4.2, tile * 1.5, "#b2c5a1");
  ellipse(width * 0.5, y, tile * 4, tile * 1.4, "#d0d5ac");
  ellipse(width * 0.5, y - tile * 0.15, tile * 3.65, tile * 1.2, "#b8ce9e");
  round(width / 2 - tile * 0.45, y + tile * 0.6, tile * 0.9, tile * 2.2, 2, "#bcae84");
  for (let i = -3; i <= 3; i++) tree(width / 2 + i * tile, y + Math.sin(i * 2) * tile * 0.5, tile * (0.65 + (i % 2 ? 0.2 : 0)));
  text("TORONTO ISLAND", width / 2, y + tile * 0.4, tile * 0.16, "#547447", "700");
}

function drawLane(lane, y, tile, left, time) {
  const width = viewWidth;
  ctx.fillStyle = terrain[lane.type]; ctx.fillRect(0, y - tile * 0.5, width, tile + 1);
  if (lane.type === "road") {
    ctx.fillStyle = "#c8c9ad";
    for (let x = left - tile; x < width; x += tile * 1.2) ctx.fillRect(x, y - tile * 0.47, tile * 0.48, tile * 0.025);
    ctx.fillStyle = "#64716a"; ctx.fillRect(0, y + tile * 0.4, width, tile * 0.07);
  } else if (lane.type === "bike") {
    ctx.fillStyle = "#deebd0"; ctx.fillRect(0, y - tile * 0.48, width, tile * 0.03); ctx.fillRect(0, y + tile * 0.45, width, tile * 0.03);
    text("BIKE  \u2192", left + 4.5 * tile, y + tile * 0.1, tile * 0.16, "#799c7a", "700");
  } else if (["plaza", "sidewalk", "people"].includes(lane.type)) {
    ctx.strokeStyle = "#c4c6b15c"; ctx.lineWidth = 0.6;
    for (let x = left - tile; x < width; x += tile) { ctx.beginPath(); ctx.moveTo(x, y - tile / 2); ctx.lineTo(x, y + tile / 2); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(0, y + tile / 2); ctx.lineTo(width, y + tile / 2); ctx.stroke();
  } else {
    ctx.fillStyle = "#9cbb892d";
    for (let i = 0; i < 20; i++) ctx.fillRect((i * 71 + lane.row * 23) % width, y + ((i % 3) - 1) * tile * 0.22, 2, 3);
  }
  if (lane.checkpoint) {
    text("SAFE STOP", left + tile * 4.5, y + tile * 0.12, tile * 0.16, "#70905c", "700");
    round(left - tile * 0.1, y - tile * 0.3, tile * 0.17, tile * 0.6, 2, "#7b9b66");
  }
  for (const [i, x] of hazardPositions(lane, time).entries()) {
    const px = left + (x + 0.5) * tile;
    if (lane.type === "road") car(px, y, tile * 0.94, carColors[(i + lane.palette) % 4], Math.sign(lane.speed));
    if (lane.type === "bike") bike(px, y + tile * 0.12, tile, Math.sign(lane.speed), time);
    if (lane.type === "people") pedestrian(px, y + tile * 0.1, tile, (lane.palette + i) % 4, time);
  }
  if (lane.vendor) vendor(left + (lane.vendor.x + 0.5) * tile, y, tile * 0.85, lane.vendor.kind, run?.usedVendors.has(lane.row));
  if (!lane.speed && !lane.vendor && lane.row % 3 === 0 && lane.row > 3) {
    tree(left - tile * 0.7, y + tile * 0.2, tile * 0.92);
    tree(left + tile * 9.7, y + tile * 0.2, tile * 0.92);
  }
  if (lane.row % 26 === 12) {
    round(left + tile * 9.25, y - tile * 0.8, 3, tile * 1.3, 1, "#71866a");
    round(left + tile * 8.25, y - tile * 0.93, tile * 2, tile * 0.3, 2, "#4b775a");
    text(locationName(lane.row / MODES[mode].rows).toUpperCase(), left + tile * 9.25, y - tile * 0.72, tile * 0.1, "#eef4df");
  }
}

function drawHome(time) {
  const tile = Math.min(viewWidth / 12, viewHeight / 13);
  const left = (viewWidth - COLS * tile) / 2;
  const base = viewHeight - tile * 0.85;
  ctx.fillStyle = "#c3d4b0"; ctx.fillRect(0, 0, viewWidth, viewHeight);
  drawWater(viewWidth, Math.max(viewHeight * 0.27, viewHeight - tile * 9), time);
  drawIsland(viewWidth * 1.18, viewHeight * 0.02, tile * 0.72);
  ferry(viewWidth * 0.71 + Math.sin(time * 0.3) * tile * 0.1, viewHeight * 0.2, tile * 0.58);
  for (let row = 8; row >= 2; row--) {
    const lane = { ...demoRoute[row + 3], row };
    if (row === 8) { lane.type = "park"; lane.speed = 0; lane.vendor = { x: 6, kind: "shield" }; }
    drawLane(lane, base - row * tile, tile, left, time * 0.28);
  }
  // The tower is an original, simplified landmark illustration.
  ctx.save(); ctx.translate(left + tile * 0.2, base - tile * 7.5); ctx.scale(tile, tile);
  polygon([[-0.07, 0.1], [0.04, -3.1], [0.13, 0.1]], "#929b83");
  ellipse(0.03, -2.18, 0.35, 0.12, "#88957d");
  round(-0.22, -2.29, 0.5, 0.12, 0.02, "#c1c6a9");
  round(0, -3.5, 0.04, 0.8, 0.01, "#7f9079");
  ctx.restore();
  ctx.fillStyle = "#dcdcc5"; ctx.fillRect(0, base - tile * 1.5, viewWidth, tile * 3);
  station(left + tile * 4.5, base - tile * 0.1, tile * 0.78);
  tree(left - tile * 0.1, base, tile * 0.8);
  tree(left + tile * 9.2, base, tile * 0.8);
  animal(character, left + tile * 4.5, base + tile * 0.42, tile * 0.7);
  const vignette = ctx.createLinearGradient(0, 0, viewWidth * 0.5, viewHeight * 0.3);
  vignette.addColorStop(0, "#e2e8ccaa"); vignette.addColorStop(1, "#e2e8cc00");
  ctx.fillStyle = vignette; ctx.fillRect(0, 0, viewWidth * 0.55, viewHeight * 0.45);
}

function drawRun() {
  const tile = Math.min(viewWidth / 10.5, viewHeight / (viewHeight < 360 || viewWidth > viewHeight * 1.6 ? 7 : 12));
  if (run.status === "ferry" || run.status === "won") {
    drawWater(viewWidth, viewHeight, animationTime);
    drawIsland(viewWidth, viewHeight * 0.24, tile);
    const fraction = Math.min(1, run.ferryElapsed / FERRY_TIME);
    const y = viewHeight * 0.85 - fraction * viewHeight * 0.37;
    ferry(viewWidth / 2, y, tile * 1.3);
    animal(character, viewWidth / 2, y - tile * 0.3, tile * 0.5);
    if (run.status === "won" && !reducedMotion) {
      for (let i = 0; i < 45; i++) {
        ctx.fillStyle = ["#f1cb7f", "#f7f0d7", "#e4a77d", "#68986c"][i % 4];
        ctx.fillRect((i * 151) % viewWidth, (i * 97 + animationTime * 35) % viewHeight, 4, 7);
      }
    }
    return;
  }
  const pos = physicalPosition(run);
  const destination = Math.max(run.checkpoint, pos.row);
  camera += (destination - camera) * 0.1;
  const base = viewHeight * 0.73;
  const left = (viewWidth - COLS * tile) / 2;
  ctx.fillStyle = "#c3d4b0"; ctx.fillRect(0, 0, viewWidth, viewHeight);
  const highest = Math.min(run.route.length - 1, Math.ceil(camera + base / tile) + 2);
  const lowest = Math.max(0, Math.floor(camera - (viewHeight - base) / tile) - 2);
  for (let row = highest; row >= lowest; row--) drawLane(run.route[row], base - (row - camera) * tile, tile, left, run.elapsed);
  if (camera < 5) station(left + tile * 4.5, base + (1.7 + camera) * tile, tile);
  if (highest > MODES[run.mode].rows - 4) {
    const y = base - (MODES[run.mode].rows - camera) * tile;
    text("FERRY TO THE ISLAND  \u2191", viewWidth / 2, y - tile * 0.08, tile * 0.19, "#4f7656", "700");
  }
  const hop = run.hopLeft ? Math.sin((1 - run.hopLeft / HOP) * Math.PI) * 0.19 : 0;
  const flashing = run.immuneLeft > 0 && Math.floor(run.elapsed * 7) % 2 === 0;
  ctx.globalAlpha = flashing ? 0.55 : 1;
  animal(character, left + (pos.x + 0.5) * tile, base - (pos.row - camera) * tile, tile * 0.86, reducedMotion ? 0 : hop, run.shieldLeft > 0);
  ctx.globalAlpha = 1;
}

function resize() {
  const rect = stage.getBoundingClientRect();
  viewWidth = rect.width;
  viewHeight = rect.height;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(viewWidth * dpr);
  canvas.height = Math.round(viewHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
new ResizeObserver(resize).observe(stage);

function renderPortraits() {
  const container = $("#characters");
  container.replaceChildren();
  for (const [index, item] of CHARACTERS.entries()) {
    const button = document.createElement("button");
    button.className = `character${item.id === character ? " selected" : ""}`;
    button.setAttribute("aria-label", `${item.name} the ${item.species}`);
    button.setAttribute("aria-pressed", String(item.id === character));
    const portrait = document.createElement("canvas");
    portrait.width = 116; portrait.height = 124; portrait.setAttribute("aria-hidden", "true");
    button.append(portrait);
    button.onclick = () => { character = item.id; savePrefs(); renderPortraits(); $("#character-count").textContent = `${index + 1} / 4`; };
    container.append(button);
    const p = portrait.getContext("2d");
    // Draw the same original character art into each selection portrait.
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    const originalWidth = canvas.width, originalHeight = canvas.height;
    // A clipped region of the scene canvas avoids a second drawing implementation.
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 116, 124); ctx.clip();
    ctx.clearRect(0, 0, 116, 124);
    animal(item.id, 58, 104, 85);
    p.drawImage(canvas, 0, 0, Math.min(116, originalWidth), Math.min(124, originalHeight), 0, 0, 116, 124);
    ctx.restore(); ctx.restore();
  }
  const chosen = CHARACTERS.find(item => item.id === character);
  $("#character-name").textContent = `${chosen.name} the ${chosen.species}`;
  $("#character-detail").textContent = chosen.detail;
  $("#character-count").textContent = `${CHARACTERS.findIndex(c => c.id === character) + 1} / 4`;
}

function setMode(value) {
  mode = value;
  document.querySelectorAll("[data-mode]").forEach(button => {
    button.classList.toggle("selected", button.dataset.mode === mode);
    button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  });
  savePrefs();
}
document.querySelectorAll("[data-mode]").forEach(button => button.onclick = () => setMode(button.dataset.mode));

function beep(frequency, duration = 0.06, volume = 0.04) {
  if (!sound) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume().catch(error => console.warn("Audio resume failed:", error.message));
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = "sine"; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
    oscillator.connect(gain); gain.connect(audio.destination);
    oscillator.start(); oscillator.stop(audio.currentTime + duration);
  } catch (error) {
    console.warn("Audio is unavailable:", error.message);
    sound = false; updateSound(); savePrefs();
  }
}
function updateSound() { $("#sound").textContent = sound ? "Sound on" : "Sound off"; $("#sound").setAttribute("aria-label", sound ? "Turn sound off" : "Turn sound on"); $("#sound").setAttribute("aria-pressed", String(sound)); }
$("#sound").onclick = () => { sound = !sound; updateSound(); savePrefs(); if (sound) beep(660); };

function showModal(kind, html) {
  modalKind = kind;
  content.innerHTML = html;
  if (!dialog.open) dialog.showModal();
}
function closeModal() { if (dialog.open) dialog.close(); modalKind = ""; }
dialog.addEventListener("close", () => {
  if (!run) return;
  if (!ended && !active && modalKind !== "tutorial") showResume();
  else if (ended) finishResultAgain();
});
dialog.addEventListener("cancel", event => {
  if (run && !ended && !active) { event.preventDefault(); if (modalKind !== "tutorial") showResume(); }
});

function startRun() {
  closeModal();
  resultNotice = "";
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  run = createRun(mode, seed, character);
  active = false; ended = false; camera = 0; accumulator = 0; buffer = null; uiSecond = -1;
  document.body.dataset.state = "playing";
  $("#intro").hidden = true; $("#journey").hidden = false;
  $("#postcard").hidden = true; $("#home-pin").hidden = true; $("#preview-badge").hidden = true;
  $("#hud").hidden = false; $("#pause").hidden = false; $("#progress-hud").hidden = false; $("#touch-controls").hidden = false;
  $("#journey-description").textContent = `${MODES[mode].label} pace. About ${MODES[mode].minutes} minute${MODES[mode].minutes > 1 ? "s" : ""}. One safe crossing at a time.`;
  showModal("tutorial", `<div class="eyebrow">YOUR ISLAND FIELD GUIDE</div><h2 id="modal-title">A few good hops.</h2><ul class="rules-list"><li>Swipe or use the arrow buttons to hop. Desktop? Arrow keys or WASD.</li><li>Wait for gaps in cars, bikes, and people. A bump costs one life.</li><li>Striped carts give shields or +1 life. Get close and tap Collect (or E).</li><li>Reach the ferry, then sail to Toronto Island to win.</li></ul><p>About ${MODES[mode].minutes} minute${MODES[mode].minutes > 1 ? "s" : ""}, not a countdown. Take your time.</p><div class="board-status">${leaderboard.persistent ? "Winning trips are saved on this browser only, not shared with other players." : "Browser storage is unavailable. Scores will last for this visit only."}</div><button class="primary" id="begin">Got it. Island, here I come! <span>&#8599;</span></button>`);
  $("#begin").onclick = () => { active = true; closeModal(); beep(660); canvas.focus(); };
  updateHud();
}

function formatTime(seconds) { return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`; }
function formatScore(milliseconds) { return `${formatTime(milliseconds / 1000)}.${String(milliseconds % 1000).padStart(3, "0")}`; }

function attemptMove(dx, dy) {
  if (!active || !run || run.status !== "running" || dialog.open) return;
  if (move(run, dx, dy)) { beep(270 + (run.row % 4) * 35, 0.04, 0.016); buffer = null; }
  else if (run.hopLeft > 0) buffer = { dx, dy, expires: performance.now() + 180 };
}
document.querySelectorAll("[data-move]").forEach(button => button.addEventListener("pointerdown", event => { event.preventDefault(); const [dx, dy] = button.dataset.move.split(",").map(Number); attemptMove(dx, dy); }));
canvas.addEventListener("pointerdown", event => { pointer = { x: event.clientX, y: event.clientY, id: event.pointerId }; canvas.setPointerCapture(event.pointerId); });
canvas.addEventListener("pointerup", event => {
  if (!pointer || pointer.id !== event.pointerId) return;
  const dx = event.clientX - pointer.x; const dy = event.clientY - pointer.y; pointer = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 15) return;
  if (Math.abs(dx) > Math.abs(dy)) attemptMove(Math.sign(dx), 0); else attemptMove(0, -Math.sign(dy));
});
canvas.addEventListener("pointercancel", () => { pointer = null; });
document.addEventListener("keydown", event => {
  const keys = { ArrowUp: [0, 1], w: [0, 1], ArrowDown: [0, -1], s: [0, -1], ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0] };
  if (dialog.open) return;
  if (event.key === "Escape" || event.key === "p") { if (active) { event.preventDefault(); pause(); } return; }
  if (event.key.toLowerCase() === "e" && active) { event.preventDefault(); collect(run); return; }
  if (keys[event.key] && active) { event.preventDefault(); attemptMove(...keys[event.key]); }
});
$("#collect").onclick = () => { if (run && active && collect(run)) beep(850, 0.2); };

function pause() {
  if (!run || ended || !active) return;
  active = false; buffer = null; accumulator = 0; audio?.suspend().catch(error => console.warn("Could not pause audio:", error.message));
  showResume();
}
function showResume() {
  showModal("pause", `<div class="eyebrow">TAKE A BREATHER</div><h2 id="modal-title">The island can wait.</h2><p>Your trip is paused. Traffic, shields, and your active timer are on hold.</p><div class="modal-actions"><button class="primary" id="resume">Back to the adventure</button><button class="secondary" id="quit">Choose a new trip</button></div>`);
  $("#resume").onclick = () => { active = true; closeModal(); beep(550); };
  $("#quit").onclick = home;
}
$("#pause").onclick = pause; $("#mobile-pause").onclick = pause;
document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); lastFrame = 0; accumulator = 0; });
window.addEventListener("blur", pause);

function home() {
  active = false; run = null; ended = false; buffer = null;
  closeModal(); document.body.dataset.state = "home";
  $("#intro").hidden = false; $("#journey").hidden = true;
  for (const id of ["postcard", "home-pin", "preview-badge"]) $(`#${id}`).hidden = false;
  for (const id of ["hud", "pause", "progress-hud", "touch-controls", "toast"]) $(`#${id}`).hidden = true;
  $("#place").textContent = "UNION STATION"; $("#start").focus();
}
$("#start").onclick = startRun; $("#new-trip").onclick = () => { if (active) pause(); else home(); };

function finish() {
  if (ended) return;
  ended = true; active = false; document.body.dataset.state = "finished";
  const won = run.status === "won";
  if (won) {
    const result = leaderboard.add(run.mode, {
      character: run.character,
      elapsed: Math.round(run.elapsed * 1000),
      collisions: run.collisions,
      lives: run.lives,
      completedAt: Date.now(),
    });
    resultNotice = result.rank === null
      ? "This trip did not reach this browser's top 20."
      : `Your arrival is #${result.rank} on this browser's ${MODES[run.mode].label} leaderboard.`;
    resultNotice += result.persistent
      ? " Scores are saved on this browser only."
      : " Browser storage is unavailable; scores last for this visit only.";
    const key = `best-${mode}`;
    if (!Number.isFinite(prefs[key]) || run.elapsed < prefs[key]) { prefs[key] = run.elapsed; savePrefs(); }
    beep(790, 0.3);
  } else beep(180, 0.2);
  renderResult();
}

function renderResult() {
  const won = run.status === "won";
  showModal("result", `<div class="eyebrow">${won ? "YOU MADE IT TO TORONTO ISLAND" : "EVERY COMMUTER HAS THOSE DAYS"}</div><h2 id="modal-title">${won ? "Hello, island time." : "One more little hop?"}</h2><p>${won ? "The skyline's behind you. The whole afternoon's ahead." : "A little bump in the road. Pick yourself up and try the trip again."}</p><div class="modal-stat-grid"><div><strong>${formatTime(run.elapsed)}</strong><span>Active time</span></div><div><strong>${won ? run.lives : `${Math.floor(run.maxRow / MODES[mode].rows * 100)}%`}</strong><span>${won ? "Lives left" : "Route reached"}</span></div><div><strong>${run.collisions}</strong><span>Bumps</span></div></div><div id="result-status" class="board-status">${won ? resultNotice : "Your next island escape is one tap away."}</div><div class="modal-actions"><button id="retry" class="primary">Catch another ferry</button><button id="result-board" class="secondary">Local leaderboard</button><button id="return-home" class="text-button">Change character or pace</button>${won ? '<button id="share" class="text-button">Share the adventure</button>' : ""}</div>`);
  $("#retry").onclick = startRun; $("#return-home").onclick = home;
  $("#result-board").onclick = () => showBoard(mode);
  if ($("#share")) $("#share").onclick = async () => {
    const url = new URL("./", location.href).href;
    try {
      if (navigator.share) await navigator.share({ title: "Union to Island", text: "A little hop. A big Toronto adventure.", url });
      else { await navigator.clipboard.writeText(url); $("#share").textContent = "Game link copied"; }
    } catch (error) { if (error.name !== "AbortError") $("#result-status").textContent = `Couldn't share automatically. Copy this address: ${url}`; }
  };
}

function showBoard(selectedMode = mode) {
  if (active) { active = false; buffer = null; }
  const entries = leaderboard.entries(selectedMode);
  const best = prefs[`best-${selectedMode}`];
  showModal("board", `<div class="eyebrow">YOUR ISLAND ARRIVALS</div><h2 id="modal-title">Local leaderboard.</h2><p class="board-note">Fastest winning trips on this browser, by pace. Scores are not shared with other players.</p><div class="board-tabs">${Object.entries(MODES).map(([id, value]) => `<button data-board="${id}" class="${id === selectedMode ? "selected" : ""}" aria-pressed="${id === selectedMode}">${value.label}</button>`).join("")}</div><div class="board-status" id="board-status"></div><ol class="board-list" id="board-list"></ol><p class="board-note">Clearing browser data or switching browsers removes access to these scores.</p><button class="secondary" id="board-back">${run && !ended ? "Back to your trip" : "Back to the adventure"}</button>`);
  document.querySelectorAll("[data-board]").forEach(button => button.onclick = () => showBoard(button.dataset.board));
  $("#board-back").onclick = () => { if (run && !ended) showResume(); else if (run) finishResultAgain(); else closeModal(); };
  const summary = entries.length ? `${MODES[selectedMode].label} \u00b7 Top ${entries.length}` : `No ${MODES[selectedMode].label} trips on this leaderboard yet. Reach the island to add one!`;
  const bestMilliseconds = Math.round(best * 1000);
  const previousBest = Number.isSafeInteger(bestMilliseconds) && bestMilliseconds > 0 ? ` Personal best: ${formatScore(bestMilliseconds)}.` : "";
  $("#board-status").textContent = `${summary}${previousBest}${leaderboard.persistent ? "" : " Browser storage is unavailable; scores last for this visit only."}`;
  for (const [i, item] of entries.entries()) {
    const li = document.createElement("li"); const rank = document.createElement("b"); const details = document.createElement("span"); const name = document.createElement("strong"); const meta = document.createElement("small"); const time = document.createElement("time");
    rank.textContent = String(i + 1).padStart(2, "0");
    name.textContent = CHARACTERS.find(character => character.id === item.character).name;
    const date = new Date(item.completedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    meta.textContent = `${date} \u00b7 ${item.collisions} ${item.collisions === 1 ? "bump" : "bumps"}`;
    time.textContent = formatScore(item.elapsed);
    details.append(name, meta); li.append(rank, details, time); $("#board-list").append(li);
  }
}
function finishResultAgain() { renderResult(); }
$("#open-board").onclick = () => showBoard();
$("#about").onclick = () => showModal("about", `<div class="eyebrow">SMALL GAME. OPEN SKIES.</div><h2 id="modal-title">Made for a little escape.</h2><div class="privacy-copy"><p>Union to Island is an original Toronto crossing game. Kit, Ducky, Bolt, and Ace are original developer-themed characters inspired by the friendly spirit of GitHub-style mascots. They are not GitHub, Octocat, or Crossy Road characters. No affiliation or endorsement is implied.</p><p>Sound and illustrations are generated in the browser. No external fonts, ads, analytics, location permission, or sign-in.</p><p>Settings and leaderboard scores stay in this browser when storage is available. Scores are not uploaded or shared. Clearing browser data removes them; private browsing may not retain them.</p><p>The hosting provider may retain standard request or security logs under its own policies. Route times are targets, not deadlines. This is a compressed arcade map, not walking directions. Loading the game needs internet.</p></div>`);

function updateHud() {
  if (!run) return;
  const second = Math.floor(run.elapsed);
  if (second !== uiSecond) { $("#clock").textContent = formatTime(run.elapsed); uiSecond = second; }
  $("#hearts").textContent = "\u2665".repeat(run.lives) + "\u2661".repeat(5 - run.lives);
  $("#hearts").setAttribute("aria-label", `${run.lives} lives`);
  $("#shield").hidden = run.shieldLeft <= 0;
  $("#shield").textContent = `SHIELD ${Math.ceil(run.shieldLeft)}s`;
  const progress = run.maxRow / MODES[mode].rows;
  $("#progress-fill").style.width = `${progress * 100}%`;
  $("#place").textContent = run.status === "ferry" ? "TORONTO HARBOUR" : run.status === "won" ? "TORONTO ISLAND" : locationName(progress).toUpperCase();
  const stops = [...document.querySelectorAll(".route-stop")];
  const current = stops.findLastIndex(stop => progress >= Number(stop.dataset.progress));
  stops.forEach((stop, i) => stop.classList.toggle("active", i <= current));
  const vendorHere = run.route[run.row]?.vendor;
  const near = run.status === "running" && run.hopLeft === 0 && vendorHere && Math.abs(run.x - vendorHere.x) <= 1 && !run.usedVendors.has(run.row);
  $("#collect").disabled = !near;
  const collectLabel = near ? `Collect <span>${vendorHere.kind === "heart" ? "+1 life" : "shield"}</span>` : "Collect <span>near a cart</span>";
  if ($("#collect").innerHTML !== collectLabel) $("#collect").innerHTML = collectLabel;
  $("#toast").hidden = run.messageLeft <= 0 || dialog.open;
  if (run.messageLeft > 0) $("#toast").textContent = run.message;
}

function frame(timestamp) {
  const delta = lastFrame ? Math.min((timestamp - lastFrame) / 1000, 0.1) : 0;
  lastFrame = timestamp;
  if (!document.hidden) animationTime += delta;
  if (active && run) {
    accumulator += delta;
    while (accumulator >= 1 / 60) {
      tick(run, 1 / 60); accumulator -= 1 / 60;
      if (buffer && buffer.expires >= timestamp && run.hopLeft === 0) { const { dx, dy } = buffer; buffer = null; move(run, dx, dy); }
      if (buffer && buffer.expires < timestamp) buffer = null;
    }
    if (run.status === "won" || run.status === "lost") finish();
  }
  ctx.clearRect(0, 0, viewWidth, viewHeight);
  if (run) { drawRun(); updateHud(); } else drawHome(animationTime);
  requestAnimationFrame(frame);
}

resize(); renderPortraits(); setMode(mode); updateSound();
requestAnimationFrame(frame);
