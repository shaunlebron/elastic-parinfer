import { indentMode } from "./parinfer.js";

//------------------------------------------------------------------------------
// State
//------------------------------------------------------------------------------

const delim = "|";
const animTime = 0.1;

const state = {
  cursor: { i: 0, x: 0, y: 0, t: 0 },
  cam: { x: 0, y: 0, w: 0, h: 0 },
  text: "",

  // derived from text
  lines: [""],

  displayText: "",
  displayLines: [""],
  displayCursor: { x: 0, xMax: 0 }
};

const initialText = `(|defn foo
|"hello, this is a docstring"
|[a b]
|(|let [|sum (+ a b)
|||prod (* a b)]
||
||{|:sum sum
|||:prod prod}))

(foo|bar
|baz)

(|foo bar
|baz)
`;

//------------------------------------------------------------------------------
// Typography
//------------------------------------------------------------------------------

const backgroundColor = "#111";
const fontColor = "#eee";
const delimColor = "#555";
const margin = 50;
const fontFamily = "Menlo, monospace";
const fontSize = 32;
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
  for (let i = start; i < stop; i += step) result.push(i);
  return result;
}

function splitArray(array, shouldSplit) {
  const n = array.length;
  if (n === 0) return [];
  let indexes = range(1, n).filter(i => shouldSplit(array[i], array[i - 1]));
  indexes = [0, ...indexes, n];
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
  canvas.style.cursor = "text";
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
// Derived State
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

function updateDisplayCursor() {
  const { x, y } = state.cursor;
  const x0 = textToDisplayCol(state, x, y);
  state.displayCursor.x = x0;
  state.displayCursor.xMax = x0;
}

function updateCamera() {
  const { cam, cursor } = state;
  cam.w = Math.floor((canvasW - 2 * margin) / charSize.w);
  cam.h = Math.floor((canvasH - 2 * margin) / charSize.h);
  cam.x = clamp(cam.x, cursor.x - cam.w + 1, cursor.x);
  cam.y = clamp(cam.y, cursor.y - cam.h + 1, cursor.y);
}

function processText(text) {
  text = expandElasticChars(text);
  const indents = [];
  const lines = [];
  const pipeMatcher = new RegExp(`^([\\s${delim}]*)(.*)`);
  const cleanPipes = line =>
    line.replace(pipeMatcher, (_, indent, code) => {
      indents.push(indent);
      return " ".repeat(indent.length) + code;
    });
  const restorePipes = (line, i) => indents[i] + line.slice(indents[i].length);
  const inputText = text
    .split("\n")
    .map(cleanPipes)
    .join("\n");
  const outputText = indentMode(inputText).text;
  return outputText
    .split("\n")
    .map(restorePipes)
    .join("\n");
}

function updateText(text, newChar) {
  const displayText = processText(text);

  state.text = text;
  state.oldLines = state.lines;
  state.lines = text.split("\n");
  state.displayText = displayText;
  state.oldDisplayLines = state.displayLines;
  state.displayLines = displayText.split("\n");
}

function setTextAnimation(oldStr, newStr) {
  const { cursor, lines, oldLines, displayLines, oldDisplayLines } = state;
  const oldVals = oldLines.map(line => line.split(delim));
  const newVals = lines.map(line => line.split(delim));
  const delimVal = (val,i) => (i === 0 ? "" : delim) + val;
  const delimVals = lines.map(line => line.split(delim).map(delimVal));
  const oldWidths = oldDisplayLines.map(line => line.split(delim).map(s => s.length));
  const newWidths = displayLines.map(line => line.split(delim).map(s => s.length));
  const { x, y } = cursor;
  const i = lines[y].slice(0, x).split(delim).length-1; // cell number of cursor
  if (newStr === "|" && oldStr === "") {
    // SPLIT CELL
    // (|ab| => |a|b|)
    //                  OLD | NEW
    //           i-1        |        i-1   i
    //   /------------------|----------------------\
    // y | "...| a b |..."  |  "...|  a  | b |..." | y
    //   \--------^---------|-------------^--------/
    //            | cursor before         | cursor after
    const oldW = oldWidths[y][i-1];
    const a = newVals[y][i-1];
    oldWidths[y].splice(i-1, 1, a.length, oldW - a.length);
  } else if (newStr === "" && oldStr === "|") {
    // MERGE CELLS
    // (|a|b| => |ab|)
    //                      OLD | NEW
    //           i   i+1        |         i
    //   /----------------------|------------------\
    // y | "...| a |  b  |..."  |  "...| a b |..." | y
    //   \----------^-----------|---------^--------/
    //              | cursor before       | cursor after
    const [a,b] = oldVals[y].slice(i,i+2);
    const newW = newWidths[y][i];
    newWidths[y].splice(i, 1, a.length, newW - a.length);
    delimVals[y].splice(i, 1, delimVal(a, i), b);
  } else if (newStr === "\n" && oldStr === "") {
    // SPLIT LINE
    // (|ab| => |a \n b|)
    //                     OLD | NEW
    //               i         |    0       i
    //     /-------------------|----------------\
    // y-1 |  "...| a b |..."  |  ".......| a " | y-1
    //     \---------^---------|  " b |......." | y
    //               |         \---^------------/
    //       cursor before         | cursor after
    const i = newVals[y-1].length-1;
    const a = newVals[y-1][i];
    const [oldW, ...rest] = oldWidths[y-1].slice(i);
    oldWidths.splice(y, 0, [oldW - a.length, ...rest]);
    oldWidths[y-1].splice(i+1);
  } else if (newStr === "" && oldStr === "\n") {
    // MERGE LINES
    // (|a \n b| => |ab|)
    //                  OLD | NEW
    //         0       i    |         i
    //     /----------------|------------------\
    // y   | ".......| a "  |  "...| a b |..." | y
    // y+1 | " b |......."  |---------^--------/
    //     \--^-------------/         |
    //        | cursor before    cursor after
    const a = oldVals[y][i];
    const [bw, ...rest] = oldWidths[y+1];
    oldWidths[y].splice(i, 1, a.length + bw, ...rest);
    oldWidths.splice(y+1, 1);
  } else {
    // no animation
    state.textAnim = null;
    return;
  }
  state.textAnim = { delimVals, oldWidths, newWidths, t: 0 };
}

function updateTextAnim(dt) {
  const { textAnim } = state;
  if (!textAnim) return;
  if (textAnim.t + dt > animTime) state.textAnim = null;
  else textAnim.t += dt;
  state.cursor.t = 0;
  draw();
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

const cellWidths = cells =>
  cells.map((text, i) => text.length + (i > 0 ? 1 : 0));

function displayToTextCol({ lines, displayLines }, x, y) {
  const widths = cellWidths(lines[y].split(delim));
  const eWidths = cellWidths(displayLines[y].slice(0, x).split(delim));
  const i = eWidths.length - 1;
  return (
    widths.slice(0, i).reduce((sum, w) => sum + w, 0) +
    Math.min(eWidths[i], widths[i])
  );
}

function textToDisplayCol({ lines, displayLines }, x, y) {
  const eWidths = cellWidths(displayLines[y].split(delim));
  const widths = cellWidths(lines[y].slice(0, x).split(delim));
  const i = widths.length - 1;
  return eWidths.slice(0, i).reduce((sum, w) => sum + w, 0) + widths[i];
}

//------------------------------------------------------------------------------
// Keys
//------------------------------------------------------------------------------

function leftRight(dx) {
  const { text, cursor } = state;
  const i = clamp(cursor.i + dx, 0, text.length);
  const { x, y } = getCursorXY({ text, i });

  Object.assign(state.cursor, { i, x, y });
  updateDisplayCursor();
  state.textAnim = null;
}
function upDown(dy) {
  const { text, lines, cursor, displayCursor } = state;
  const y = clamp(cursor.y + dy, 0, lines.length - 1);
  const x = displayToTextCol(state, displayCursor.xMax, y);
  const i = getCursorI({ lines, x, y });
  const displayX = textToDisplayCol(state, x, y);

  Object.assign(state.cursor, { i, x, y });
  state.displayCursor.x = displayX;
  state.textAnim = null;
}
function edit(i0, i1, newStr) {
  let { text } = state;
  i0 = clamp(i0, 0, text.length + 1);
  i1 = clamp(i1, 0, text.length + 1);
  const oldStr = text.slice(i0, i1);
  text = text.slice(0, i0) + newStr + text.slice(i1);
  const i = i0 + newStr.length;
  const { x, y } = getCursorXY({ text, i });

  updateText(text);
  Object.assign(state.cursor, { i, x, y });
  updateDisplayCursor();
  setTextAnimation(oldStr, newStr);
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
    if (e.key === "Tab") {
      if (e.shiftKey) {
        if (state.text[i - 1] === delim) edit(i - 1, i, "");
      } else {
        edit(i, i, delim);
      }
      e.preventDefault();
    }
  }
  draw();
}

function setCursorToMouse(e) {
  const { cam } = state;
  let y = Math.floor((e.offsetY - margin) / charSize.h);
  y = cam.y + clamp(y, 0, cam.h - 1);
  y = clamp(y, 0, state.lines.length - 1);
  let x = Math.round((e.offsetX - margin) / charSize.w);
  x = cam.x + clamp(x, 0, cam.w - 1);
  x = displayToTextCol(state, x, y);
  const { lines } = state;
  const i = getCursorI({ lines, x, y });

  Object.assign(state.cursor, { i, x, y, t: 0 });
  updateDisplayCursor();
  draw();
}

function onMouseDown(e) {
  setCursorToMouse(e);
  function onMouseMove(e) {
    setCursorToMouse(e);
  }
  function onMouseUp(e) {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
}

function tween(a,b,t) {
  return a + (b-a)*t;
}

//------------------------------------------------------------------------------
// Draw
//------------------------------------------------------------------------------

function drawText(text, x, y) {
  x *= charSize.w;
  y *= charSize.h;
  ctx.fillStyle = fontColor;
  ctx.fillText(text, x, y);
  ctx.fillStyle = delimColor;
  ctx.fillText(text.replace(new RegExp(`[^${delim}]`, "g"), " "), x, y);
}

function draw() {
  updateCamera();
  const { displayLines, displayCursor, cursor, cam, textAnim } = state;

  ctx.save();
  ctx.beginPath();
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.translate(margin, margin);
  ctx.translate(-cam.x * charSize.w, 0);

  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  if (textAnim) {
    // draw motion text
    const { delimVals, oldWidths, newWidths, t  } = textAnim;
    const numLines = delimVals.length;
    for (const y of range(numLines)) {
      let x = 0;
      const numCells = delimVals[y].length;
      for (const c of range(numCells)) {
        const val = delimVals[y][c];
        drawText(val, x, y);
        const w = tween(oldWidths[y][c], newWidths[y][c], t / animTime );
        x += w + (val.startsWith(delim) ? 1 : 0);
      }
    }
  } else {
    // draw static text
    const lines = displayLines.slice(cam.y, cam.y + cam.h);
    for (const [y, line] of Object.entries(lines)) {
      drawText(line, 0, y);
    }
    if (cursor.on) {
      const w = Math.floor(charSize.w * 0.15);
      const x = Math.floor(displayCursor.x * charSize.w - w / 2);
      const y = Math.floor((cursor.y - cam.y) * charSize.h);
      ctx.fillStyle = fontColor;
      ctx.fillRect(x, y, w, charSize.h);
    }
  }
  ctx.restore();
}

//------------------------------------------------------------------------------
// Elastic algorithm
//------------------------------------------------------------------------------

// View the given text with the elastic delims expanded into spaces.
function expandElasticChars(text) {
  const all = text.split("\n").map(line => line.split(delim));
  const heads = all.map(cells => cells.slice(0, -1));
  const tails = all.map(cells => cells.slice(-1)[0]);

  // result objects
  const result = range(heads.length).map(() => []);

  // cells by coordinate
  const numRows = heads.length;
  const numCols = Math.max(...heads.map(cells => cells.length));
  const getCell = (r, c) => ({ r, c, text: heads[r][c] });

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
      for (const { r, text } of cells) result[r].push(text.padEnd(w));
    }
  }
  return result.map((cells, i) => [...cells, tails[i]].join(delim)).join("\n");
}

//------------------------------------------------------------------------------
// Init
//------------------------------------------------------------------------------

function init() {
  updateText(initialText);
  initCanvas();
  document.addEventListener("keydown", onKey);
  document.addEventListener("mousedown", onMouseDown);
  tick();
}

let lastT;
function tick() {
  const t = window.performance.now();
  if (lastT) {
    const dt = (t - lastT) / 1000;
    updateTextAnim(dt);
    updateCursorBlink(dt);
  }
  lastT = t;
  requestAnimationFrame(tick);
}

window.addEventListener("load", init);
