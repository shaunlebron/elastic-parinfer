//------------------------------------------------------------------------------
// State
//------------------------------------------------------------------------------

const state = {
  cursor: { i: 0, x: 0, y: 0, xMax: 0, t: 0 },
  cam: { x: 0, y: 0, w: 0, h: 0 },
  text: ""
};

//------------------------------------------------------------------------------
// Canvas
//------------------------------------------------------------------------------

let canvas, ctx;
let canvasW, canvasH, canvasRatio;

function initCanvas() {
  canvas = document.getElementById("canvas");
  ctx = canvas.getContext("2d");
  computeCharWidth(ctx);
  resizeCanvas();
  document.body.onresize = resizeCanvas;
}

function resizeCanvas() {
  canvasRatio = window.devicePixelRatio || 1;
  canvasW = window.innerWidth;
  canvasH = window.innerHeight;
  canvas.width = canvasW * canvasRatio;
  canvas.height = canvasH * canvasRatio;
  canvas.style.position = "absolute";
  canvas.style.left = 0;
  canvas.style.top = 0;
  canvas.style.width = `${canvasW}px`;
  canvas.style.height = `${canvasH}px`;
  ctx.scale(canvasRatio, canvasRatio);
}

//------------------------------------------------------------------------------
// Typography
//------------------------------------------------------------------------------

const backgroundColor = "black";
const fontColor = "white";
const margin = 20;
const fontFamily = "monospace";
const fontSize = 10;
const charSize = { w: null, h: 12 };

function computeCharWidth(ctx) {
  ctx.font = `${fontSize}px ${fontFamily}`;
  charSize.w = ctx.measureText("8").width;
}

//------------------------------------------------------------------------------
// Cursor
//------------------------------------------------------------------------------

function updateCursorBlink(dt) {
  const { cursor } = state;
  const beforeOn = cursor.on;
  cursor.t = cursor.t + dt;
  cursor.on = Math.floor(cursor.t * 2) % 2 === 0;
  if (beforeOn !== cursor.on) {
    draw();
  }
}

//------------------------------------------------------------------------------
// Camera
//------------------------------------------------------------------------------

function updateCamera() {
  const { cam } = state;
  cam.w = Math.floor((width - 2 * margin) / charSize.w);
  cam.h = Math.floor((height - 2 * margin) / charSize.h);
  cam.x = clamp(cam.x, cursor.x - cam.w + 1, cursor.x);
  cam.y = clamp(cam.y, cursor.y - cam.h + 1, cursor.y);
}

//------------------------------------------------------------------------------
// Coordinates
// (2D <> 1D)
//------------------------------------------------------------------------------

function getCursorXY({ text, i }) {
  const lines = text.slice(0, i).split("\n");
  const x = lines.slice(-1)[0].length;
  const y = lines.length - 1;
  return { x, y };
}

function getCursorI({ lines, x, y }) {
  return x + lines.slice(0, y).reduce((i, line) => i + line.length + 1, 0);
}

//------------------------------------------------------------------------------
// Keys
//------------------------------------------------------------------------------

function leftRight(dx) {
  const { text, cursor } = state;
  const i = clamp(cursor.i + dx, 0, text.length);
  const { x, y } = getCursorXY({ text, i });
  const xMax = x;

  state.cursor = { i, x, y, xMax };
}
function upDown(dy) {
  const { text, cursor } = state;
  const { xMax } = cursor;
  const lines = text.split("\n");
  let { x, y } = getCursorXY({ text, i: cursor.i });
  y = clamp(y + dy, 0, lines.length - 1);
  x = clamp(xMax, 0, lines[y].length);
  const i = getCursorI({ lines, x, y });

  state.cursor = { i, x, y, xMax };
}
function edit(i0, i1, replace) {
  let { text } = state;
  i0 = clamp(i0, 0, text.length + 1);
  i1 = clamp(i1, 0, text.length + 1);
  text = text.slice(0, i0) + replace + text.slice(i1);
  const i = i0 + replace.length;
  const { x, y } = getCursorXY({ text, i });
  const xMax = x;

  state.text = text;
  state.cursor = { i, x, y, xMax };
}

function onKey(e) {
  state.cursor.t = 0;
  if (!e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
    if (e.key === "ArrowLeft") return leftRight(state, -1);
    if (e.key === "ArrowRight") return leftRight(state, 1);
    if (e.key === "ArrowUp") return upDown(state, -1);
    if (e.key === "ArrowDown") return upDown(state, 1);
  }
  if (!e.ctrlKey && !e.altKey && !e.metaKey) {
    const { i } = state.cursor;
    if (e.key.length === 1) return edit(state, i, i, e.key);
    if (e.key === "Enter") return edit(state, i, i, "\n");
    if (e.key === "Backspace") return edit(state, i - 1, i, "");
    if (e.key === "Delete") return edit(state, i, i + 1, "");
  }
  updateCamera();
}

//------------------------------------------------------------------------------
// Draw
//------------------------------------------------------------------------------

function draw() {
  const { text, cursor, cam } = state;

  ctx.save();
  ctx.beginPath();
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.translate(margin, margin);
  ctx.scale(cam.k, cam.k);
  ctx.translate({ x: -cam.x * charSize.w, y: 0 });

  const lines = text.split("\n").slice(cam.y, cam.y + cam.h);
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = fontColor;
  for (const [i, line] of Object.entries(lines)) {
    const y = i * charSize.h;
    ctx.fillText(line, 0, y);
  }

  if (cursor.on) {
    const w = charSize.w * 0.1;
    const x = cursor.x * charSize.w - w / 2;
    const y = (cursor.y - cam.y) * charSize.h;
    ctx.fillStyle = fontColor;
    ctx.fillRect(x, y, w, charSize.h);
  }
  ctx.restore();
}

//------------------------------------------------------------------------------
// Init
//------------------------------------------------------------------------------

function init() {
  initCanvas();
  document.addEventListener("keydown", e => onKey(state, e));
  tick();
}

let lastT;
function tick() {
  const t = window.performance.now();
  if (lastT) {
    const dt = t - lastT;
    updateCursorBlink(dt);
  }
  lastT = t;
  requestAnimationFrame(tick);
}

window.addEventListener("load", init);
