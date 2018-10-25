//------------------------------------------------------------------------------
// State
//------------------------------------------------------------------------------

const state = {
  cursor: { i: 0, x: 0, y: 0, xMax: 0, t: 0 },
  cam: { x: 0, y: 0, w: 0, h: 0 },
  text: "",
  disp: "" // FIXME: set this from expandElasticChars(text) after each change
};

//------------------------------------------------------------------------------
// Typography
//------------------------------------------------------------------------------

const backgroundColor = "black";
const fontColor = "white";
const margin = 50;
const fontFamily = "Menlo, monospace";
const fontSize = 40;
const charSize = { w: null, h: fontSize * 1.2 };

function computeCharWidth(ctx) {
  ctx.font = `${fontSize}px ${fontFamily}`;
  charSize.w = ctx.measureText("8").width;
}

//------------------------------------------------------------------------------
// Utils
//------------------------------------------------------------------------------

function clamp(val, min, max) {
  val = Math.max(min, val);
  val = Math.min(max, val);
  return val;
}

function range(start, stop, step = 1) {
  if (stop === undefined) [start, stop] = [0, start];
  const result = [];
  for (let i = start; i < stop; i += step) {
    result.push(i);
  }
  return result;
}

function splitArray(array, shouldSplit) {
  const n = array.length;
  if (n === 0) return [];

  // get each position in the array where a split should occur
  let indexes = range(1, n).filter(i => shouldSplit(array[i], array[i - 1]));

  // insert start/end points
  indexes = [0, ...indexes, n];

  // group elements between the indexes
  return range(0, indexes.length - 1).map(i =>
    array.slice(indexes[i], indexes[i + 1])
  );
}

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
  document.body.onresize = () => {
    resizeCanvas();
    draw();
  };
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
  const { cam, cursor } = state;
  cam.w = Math.floor((canvasW - 2 * margin) / charSize.w);
  cam.h = Math.floor((canvasH - 2 * margin) / charSize.h);
  cam.x = clamp(cam.x, cursor.x - cam.w + 1, cursor.x);
  cam.y = clamp(cam.y, cursor.y - cam.h + 1, cursor.y);
}

//------------------------------------------------------------------------------
// Text Coordinates (2D <> 1D)
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
// Display<>Text Coordinates
// (1-to-1 if not for elastic characters)
//------------------------------------------------------------------------------

function displayToTextCol({ disp, text, x, y }) {
  const cells = text.split("\n")[y].split(delim);
  const eCells = disp.split("\n")[y].slice(0, x).split(delim); // prettier-ignore
  const n = eCells.length;
  // FIXME: eCells have delims stripped, so `w` will be off by -1 for each cell index > 1
  const w = range(n - 1).reduce((w, x) => w + cells[x].length, 0);
  return w + Math.min(eCells[n - 1].length, cells[n - 1].length);
}

function textToDisplayCol({ disp, text, x, y }) {
  const eCells = disp.split("\n")[y].split(delim);
  const cells = text.split("\n")[y].slice(0, x).split(delim); // prettier-ignore
  const n = cells.length;
  // FIXME: cells have delims stripped, so `w` will be off by -1 for each cell index > 1
  const w = range(n - 1).reduce((w, x) => w + eCells[x].length, 0);
  return w + cells[n - 1].length;
}

//------------------------------------------------------------------------------
// Keys
//------------------------------------------------------------------------------

function leftRight(dx) {
  const { text, cursor } = state;
  const i = clamp(cursor.i + dx, 0, text.length);
  const { x, y } = getCursorXY({ text, i });
  const xMax = x;

  Object.assign(state.cursor, { i, x, y, xMax });
}
function upDown(dy) {
  const { text, cursor } = state;
  const { xMax } = cursor;
  const lines = text.split("\n");
  let { x, y } = getCursorXY({ text, i: cursor.i });
  y = clamp(y + dy, 0, lines.length - 1);
  x = clamp(xMax, 0, lines[y].length);
  const i = getCursorI({ lines, x, y });

  Object.assign(state.cursor, { i, x, y, xMax });
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
  Object.assign(state.cursor, { i, x, y, xMax });
}

function onKey(e) {
  state.cursor.t = 0;
  if (!e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
    if (e.key === "ArrowLeft") leftRight(-1);
    if (e.key === "ArrowRight") leftRight(1);
    if (e.key === "ArrowUp") upDown(-1);
    if (e.key === "ArrowDown") upDown(1);
  }
  if (!e.ctrlKey && !e.altKey && !e.metaKey) {
    const { i } = state.cursor;
    if (e.key.length === 1) edit(i, i, e.key);
    if (e.key === "Enter") edit(i, i, "\n");
    if (e.key === "Backspace") edit(i - 1, i, "");
    if (e.key === "Delete") edit(i, i + 1, "");
  }
  updateCamera();
  draw();
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
  ctx.translate(-cam.x * charSize.w, 0);

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
    const w = Math.floor(charSize.w * 0.15);
    const x = Math.floor(cursor.x * charSize.w - w / 2);
    const y = Math.floor((cursor.y - cam.y) * charSize.h);
    ctx.fillStyle = fontColor;
    ctx.fillRect(x, y, w, charSize.h);
  }
  ctx.restore();
}

//------------------------------------------------------------------------------
// Elastic algorithm
//------------------------------------------------------------------------------

// Computes the size of all elastic tabs in the given text.
function computeElasticBlocks(text, delim) {
  // We ignore the last cell of each line
  // since the standard says we only count cells _behind_ a tab character.
  const table = text.split("\n").map(line => line.split(delim).slice(0, -1));

  // result objects
  const blocks = range(table.length).map(() => []);
  const widths = []; // map a block index to a width

  // cells by coordinate
  const numRows = table.length;
  const numCols = Math.max(...table.map(cells => cells.length));
  const getCell = (r, c) => ({ r, c, text: table[r][c] });

  // for each column, we group cells into blocks
  for (const c of range(numCols)) {
    // Get every cell in this column.
    const column = range(numRows)
      .map(r => getCell(r, c))
      .filter(({ text }) => text != null);

    // Group contiguous cells.
    const groups = splitArray(column, (curr, prev) => curr.r !== prev.r + 1);

    // process each block
    for (const cells of groups) {
      const w = Math.max(...cells.map(cell => cell.text.length));
      const i = widths.length;
      for (const { r } of cells) blocks[r].push(i);
      widths.push(w);
    }
  }
  return { blocks, widths };
}

// View the given text with the elastic tabs expanded into spaces.
function expandElasticChars(text, delim) {
  const { blocks, widths } = computeElasticTabs(text, delim);
  const expandCell = (r, c) =>
    // FIXME: text has delim prefix stripped when when c = 0
    table[r][c].padEnd(widths[blocks[r][c]]);
  const numRows = table.length;
  const numCols = r => table[r].length;
  const lines = range(numRows).map(r => {
    const cells = range(numCols(r)).map(c => expandCell(r, c));
    return cells.join("");
  });
  return lines.join("\n");
}

//------------------------------------------------------------------------------
// Init
//------------------------------------------------------------------------------

function init() {
  initCanvas();
  document.addEventListener("keydown", onKey);
  tick();
}

let lastT;
function tick() {
  const t = window.performance.now();
  if (lastT) {
    const dt = t - lastT;
    updateCursorBlink(dt / 1000);
  }
  lastT = t;
  requestAnimationFrame(tick);
}

window.addEventListener("load", init);
