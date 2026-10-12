import { COLS, ROWS, pieceChar, type CaptureKind } from '../game/banqi/rules.ts';

export type BanqiMark = {
  index: number;
  kind: CaptureKind;
};

type Metrics = {
  insetX: number;
  insetY: number;
  cellW: number;
  cellH: number;
};

const woodCache = new Map<string, HTMLCanvasElement>();

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function banqiMetrics(width: number, height: number): Metrics {
  const insetX = width * 0.045;
  const insetY = height * 0.045;
  return {
    insetX,
    insetY,
    cellW: (width - insetX * 2) / COLS,
    cellH: (height - insetY * 2) / ROWS,
  };
}

export function banqiCellAt(px: number, py: number, width: number, height: number) {
  const { insetX, insetY, cellW, cellH } = banqiMetrics(width, height);
  const x = Math.floor((px - insetX) / cellW);
  const y = Math.floor((py - insetY) / cellH);
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return null;
  return y * COLS + x;
}

function wood(width: number, height: number) {
  const key = `${width}x${height}`;
  const cached = woodCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const rand = mulberry32(20261012);
  roundRect(ctx, 0, 0, width, height, Math.min(width, height) * 0.06);
  const frame = ctx.createLinearGradient(0, 0, width, height);
  frame.addColorStop(0, '#a56b3c');
  frame.addColorStop(0.5, '#6d4324');
  frame.addColorStop(1, '#3e2616');
  ctx.fillStyle = frame;
  ctx.fill();

  const inset = Math.min(width, height) * 0.025;
  roundRect(ctx, inset, inset, width - inset * 2, height - inset * 2, Math.min(width, height) * 0.045);
  const tone = ctx.createLinearGradient(0, 0, width, height);
  tone.addColorStop(0, '#f3d7a2');
  tone.addColorStop(0.45, '#e4bc78');
  tone.addColorStop(1, '#c99552');
  ctx.fillStyle = tone;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = '#7a4b24';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 16; i += 1) {
    const y = inset + rand() * (height - inset * 2);
    ctx.beginPath();
    ctx.moveTo(inset, y);
    ctx.bezierCurveTo(width * 0.3, y + (rand() - 0.5) * 12, width * 0.7, y + (rand() - 0.5) * 10, width - inset, y);
    ctx.stroke();
  }
  ctx.restore();
  woodCache.set(key, canvas);
  return canvas;
}

function cellOrigin(metrics: Metrics, index: number) {
  const x = index % COLS;
  const y = (index / COLS) | 0;
  return {
    x: metrics.insetX + x * metrics.cellW,
    y: metrics.insetY + y * metrics.cellH,
  };
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  cell: number,
  pop: number,
) {
  const radius = size * 0.38 * pop;
  ctx.save();
  ctx.shadowColor = 'rgba(58, 28, 12, 0.28)';
  ctx.shadowBlur = size * 0.08;
  ctx.shadowOffsetY = size * 0.04;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  if (cell === 0) {
    ctx.restore();
    return;
  }
  const hidden = (cell & 16) === 0;
  const red = (cell & 8) === 0;
  const fill = ctx.createRadialGradient(cx - radius * 0.35, cy - radius * 0.4, radius * 0.1, cx, cy, radius);
  if (hidden) {
    fill.addColorStop(0, '#a04a3c');
    fill.addColorStop(0.55, '#6a241c');
    fill.addColorStop(1, '#3d120e');
  } else {
    fill.addColorStop(0, '#fffaf3');
    fill.addColorStop(1, red ? '#f0cbb8' : '#e4d9cb');
  }
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = Math.max(1.5, size * 0.045);
  ctx.strokeStyle = hidden ? '#e6c27a' : red ? '#c4382a' : '#2a2420';
  ctx.stroke();

  if (hidden) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = '#f0d7a2';
    ctx.fill();
  } else {
    const label = pieceChar(cell);
    ctx.fillStyle = red ? '#c42822' : '#1d1916';
    ctx.font = `700 ${Math.floor(radius * 0.95)}px KaiTi, STKaiti, SimSun, "Microsoft YaHei", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy + radius * 0.04);
  }
  ctx.restore();
}

export function renderBanqi(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  board: Uint8Array,
  hover: number | null,
  selected: number | null,
  marks: readonly BanqiMark[],
  last: number | null,
  placedAt: number,
) {
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(wood(Math.round(width), Math.round(height)), 0, 0, width, height);
  const metrics = banqiMetrics(width, height);
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, metrics.insetX, metrics.insetY, metrics.cellW * COLS, metrics.cellH * ROWS, 8);
  ctx.clip();
  ctx.strokeStyle = 'rgba(92, 49, 22, 0.45)';
  ctx.lineWidth = 1;
  for (let col = 0; col <= COLS; col += 1) {
    const x = metrics.insetX + col * metrics.cellW;
    ctx.beginPath();
    ctx.moveTo(x, metrics.insetY);
    ctx.lineTo(x, metrics.insetY + metrics.cellH * ROWS);
    ctx.stroke();
  }
  for (let row = 0; row <= ROWS; row += 1) {
    const y = metrics.insetY + row * metrics.cellH;
    ctx.beginPath();
    ctx.moveTo(metrics.insetX, y);
    ctx.lineTo(metrics.insetX + metrics.cellW * COLS, y);
    ctx.stroke();
  }
  ctx.restore();

  const markAt = new Map(marks.map((mark) => [mark.index, mark.kind]));
  const popIndex = last;
  const pop = popIndex === null ? 1 : 1 + 0.06 * Math.sin(Math.min(1, (performance.now() - placedAt) / 180) * Math.PI);
  const tile = Math.min(metrics.cellW, metrics.cellH);

  for (let index = 0; index < board.length; index += 1) {
    const origin = cellOrigin(metrics, index);
    const cx = origin.x + metrics.cellW / 2;
    const cy = origin.y + metrics.cellH / 2;
    if (hover === index || selected === index) {
      ctx.fillStyle = selected === index ? 'rgba(240, 176, 106, 0.28)' : 'rgba(255, 244, 214, 0.2)';
      ctx.fillRect(origin.x + 2, origin.y + 2, metrics.cellW - 4, metrics.cellH - 4);
    }
    const kind = markAt.get(index);
    if (kind) {
      ctx.beginPath();
      ctx.arc(cx, cy, tile * 0.16, 0, Math.PI * 2);
      ctx.fillStyle = kind === 'both' ? 'rgba(232, 164, 64, 0.9)' : kind === 'take' ? 'rgba(196, 54, 42, 0.9)' : 'rgba(92, 49, 22, 0.45)';
      ctx.fill();
    }
    if (board[index] !== 0) drawTile(ctx, cx, cy, tile, board[index], index === popIndex ? pop : 1);
    if (kind && board[index] !== 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, tile * 0.42, 0, Math.PI * 2);
      ctx.strokeStyle = kind === 'both' ? 'rgba(232, 164, 64, 0.95)' : 'rgba(196, 54, 42, 0.95)';
      ctx.lineWidth = Math.max(2, tile * 0.045);
      ctx.stroke();
    }
    if (last === index) {
      ctx.beginPath();
      ctx.arc(cx, cy + tile * 0.34, tile * 0.05, 0, Math.PI * 2);
      ctx.fillStyle = '#f0b06a';
      ctx.fill();
    }
  }
}
