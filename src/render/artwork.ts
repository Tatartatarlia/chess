import { BLACK, EMPTY, SIZE, WHITE, idx, type Point } from '../game/types.ts';

const publicFile = (file: string) => `${import.meta.env.BASE_URL}${file}`;

export const TARTAGLIA_SRC = publicFile('tartaglia.webp');
export const TRAVELER_SRC = publicFile('traveler.webp');

export type BoardMetrics = {
  size: number;
  origin: number;
  cell: number;
};

export function boardMetrics(size: number): BoardMetrics {
  const frame = size * 0.058;
  const pad = size * 0.055;
  const origin = frame + pad;
  const cell = (size - origin * 2) / (SIZE - 1);
  return { size, origin, cell };
}

export function pointToCell(px: number, py: number, size: number): Point | null {
  const { origin, cell } = boardMetrics(size);
  const x = Math.round((px - origin) / cell);
  const y = Math.round((py - origin) / cell);
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return null;
  const cx = origin + x * cell;
  const cy = origin + y * cell;
  const limit = cell * 0.72;
  if ((px - cx) ** 2 + (py - cy) ** 2 > limit * limit) return null;
  return { x, y };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
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

const boardCache = new Map<string, HTMLCanvasElement>();

function paintWood(ctx: CanvasRenderingContext2D, size: number) {
  const rand = mulberry32(20260311);
  roundRect(ctx, 0, 0, size, size, size * 0.045);
  const frame = ctx.createLinearGradient(0, 0, size, size);
  frame.addColorStop(0, '#a56b3c');
  frame.addColorStop(0.45, '#6d4324');
  frame.addColorStop(1, '#3e2616');
  ctx.fillStyle = frame;
  ctx.fill();

  const inset = size * 0.028;
  roundRect(ctx, inset, inset, size - inset * 2, size - inset * 2, size * 0.03);
  const wood = ctx.createLinearGradient(0, 0, size, size * 0.8);
  wood.addColorStop(0, '#f3d7a2');
  wood.addColorStop(0.4, '#e4bc78');
  wood.addColorStop(1, '#c99552');
  ctx.fillStyle = wood;
  ctx.fill();
  ctx.save();
  ctx.clip();

  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = '#7a4b24';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 22; i++) {
    const y = inset + rand() * (size - inset * 2);
    ctx.beginPath();
    ctx.moveTo(inset, y);
    ctx.bezierCurveTo(size * 0.35, y + (rand() - 0.5) * 18, size * 0.68, y + (rand() - 0.5) * 14, size - inset, y + (rand() - 0.5) * 8);
    ctx.stroke();
  }

  ctx.globalAlpha = 0.08;
  ctx.fillStyle = '#8d5a2e';
  for (let i = 0; i < 3; i++) {
    const x = size * (0.25 + rand() * 0.5);
    const y = size * (0.2 + rand() * 0.6);
    ctx.beginPath();
    ctx.ellipse(x, y, size * 0.04, size * 0.018, rand(), 0, Math.PI * 2);
    ctx.fill();
  }

  const glow = ctx.createRadialGradient(size * 0.35, size * 0.3, size * 0.05, size * 0.5, size * 0.5, size * 0.72);
  glow.addColorStop(0, 'rgba(255, 244, 214, 0.28)');
  glow.addColorStop(0.55, 'rgba(255, 244, 214, 0)');
  glow.addColorStop(1, 'rgba(92, 48, 16, 0.22)');
  ctx.globalAlpha = 1;
  ctx.fillStyle = glow;
  ctx.fillRect(inset, inset, size - inset * 2, size - inset * 2);
  ctx.restore();

  const { origin, cell } = boardMetrics(size);
  ctx.strokeStyle = 'rgba(92, 49, 22, 0.88)';
  ctx.lineWidth = Math.max(1, cell * 0.045);
  ctx.lineCap = 'square';
  ctx.beginPath();
  for (let i = 0; i < SIZE; i++) {
    const p = origin + i * cell;
    ctx.moveTo(origin, p);
    ctx.lineTo(origin + (SIZE - 1) * cell, p);
    ctx.moveTo(p, origin);
    ctx.lineTo(p, origin + (SIZE - 1) * cell);
  }
  ctx.stroke();

  const stars = [3, 7, 11];
  ctx.fillStyle = '#5c3318';
  for (const sy of stars) {
    for (const sx of stars) {
      ctx.beginPath();
      ctx.arc(origin + sx * cell, origin + sy * cell, Math.max(2.2, cell * 0.12), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function cachedBoard(logical: number, dpr: number) {
  const key = `${logical}x${dpr}`;
  const cached = boardCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(logical * dpr));
  canvas.height = canvas.width;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  paintWood(ctx, logical);
  boardCache.set(key, canvas);
  if (boardCache.size > 6) {
    const oldest = boardCache.keys().next().value;
    if (oldest) boardCache.delete(oldest);
  }
  return canvas;
}

function drawStone(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: 'black' | 'white',
  scale = 1,
) {
  const r = radius * scale;
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.ellipse(r * 0.08, r * 0.16, r * 0.92, r * 0.72, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(40, 22, 8, 0.28)';
  ctx.fill();

  const body = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.15, 0, 0, r);
  if (color === 'black') {
    body.addColorStop(0, '#6e6e6e');
    body.addColorStop(0.42, '#2a2a2a');
    body.addColorStop(1, '#070707');
  } else {
    body.addColorStop(0, '#ffffff');
    body.addColorStop(0.5, '#f3f3f3');
    body.addColorStop(1, '#c8c8c8');
  }
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = body;
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(-r * 0.32, -r * 0.36, r * 0.28, r * 0.16, -0.7, 0, Math.PI * 2);
  ctx.fillStyle = color === 'black' ? 'rgba(255,255,255,0.38)' : 'rgba(255,255,255,0.9)';
  ctx.fill();
  ctx.restore();
}

function easeOut(amount: number) {
  const t = Math.min(1, Math.max(0, amount));
  return 1 - (1 - t) * (1 - t);
}

export function renderBoard(
  ctx: CanvasRenderingContext2D,
  logical: number,
  dpr: number,
  board: Uint8Array,
  hover: Point | null,
  last: Point | null,
  win: Point[] | null,
  placedAt: number,
  hoverColor: 'black' | 'white',
) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, logical, logical);
  ctx.drawImage(cachedBoard(logical, dpr), 0, 0, logical, logical);

  const { origin, cell } = boardMetrics(logical);
  const radius = cell * 0.46;
  const now = performance.now();
  const pop = last ? easeOut((now - placedAt) / 160) : 1;
  const winKey = new Set<number>();
  if (win) {
    for (const cellPoint of win) winKey.add(idx(cellPoint.x, cellPoint.y));
  }

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const stone = board[idx(x, y)];
      if (stone === EMPTY) continue;
      const px = origin + x * cell;
      const py = origin + y * cell;
      const fresh = last !== null && last.x === x && last.y === y;
      drawStone(ctx, px, py, radius, stone === BLACK ? 'black' : 'white', fresh ? 0.55 + 0.45 * pop : 1);
      if (winKey.has(idx(x, y))) {
        ctx.beginPath();
        ctx.arc(px, py, radius + 1.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(196, 64, 36, 0.9)';
        ctx.lineWidth = Math.max(1.5, cell * 0.06);
        ctx.stroke();
      }
    }
  }

  if (hover && board[idx(hover.x, hover.y)] === EMPTY) {
    ctx.save();
    ctx.globalAlpha = 0.42;
    drawStone(ctx, origin + hover.x * cell, origin + hover.y * cell, radius, hoverColor);
    ctx.restore();
  }

  if (last && board[idx(last.x, last.y)] !== EMPTY) {
    const px = origin + last.x * cell;
    const py = origin + last.y * cell;
    ctx.beginPath();
    ctx.arc(px, py, radius * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = board[idx(last.x, last.y)] === WHITE ? '#d4542c' : '#f2d2b0';
    ctx.fill();
  }

  if (win && win.length >= 2) {
    const ordered = [...win].sort((a, b) => a.x - b.x || a.y - b.y);
    const start = ordered[0];
    const end = ordered[ordered.length - 1];
    ctx.beginPath();
    ctx.moveTo(origin + start.x * cell, origin + start.y * cell);
    ctx.lineTo(origin + end.x * cell, origin + end.y * cell);
    ctx.strokeStyle = 'rgba(196, 54, 32, 0.92)';
    ctx.lineWidth = Math.max(3, cell * 0.1);
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}

export function drawStoneIcon(ctx: CanvasRenderingContext2D, size: number, color: 'black' | 'white') {
  ctx.clearRect(0, 0, size, size);
  drawStone(ctx, size / 2, size / 2, size * 0.42, color);
}

function clipDisc(ctx: CanvasRenderingContext2D, size: number, inset: number) {
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - inset, 0, Math.PI * 2);
  ctx.clip();
}

const RINGS = {
  human: ['#f4fbff', '#8eb6d6', '#3c6f98'],
  ai: ['#ffc56a', '#ef7a32', '#b63a22'],
} as const;

export function drawPortrait(
  ctx: CanvasRenderingContext2D,
  size: number,
  who: 'human' | 'ai',
  image: CanvasImageSource | null,
) {
  ctx.clearRect(0, 0, size, size);
  const colors = RINGS[who];
  const ring = ctx.createLinearGradient(0, 0, size, size);
  ring.addColorStop(0, colors[0]);
  ring.addColorStop(0.55, colors[1]);
  ring.addColorStop(1, colors[2]);
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
  ctx.fillStyle = ring;
  ctx.fill();

  ctx.save();
  clipDisc(ctx, size, 5);
  ctx.fillStyle = who === 'ai' ? '#3a2016' : '#24384a';
  ctx.fillRect(0, 0, size, size);
  if (image) {
    const img = image as HTMLImageElement;
    const iw = img.naturalWidth || size;
    const ih = img.naturalHeight || size;
    const scale = Math.min(size / iw, size / ih) * 1.08;
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(image, (size - dw) / 2, (size - dh) / 2 + size * 0.03, dw, dh);
  } else if (who === 'ai') {
    ctx.fillStyle = '#f6d7b0';
    ctx.beginPath();
    ctx.arc(size * 0.48, size * 0.48, size * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d9843a';
    ctx.beginPath();
    ctx.ellipse(size * 0.48, size * 0.34, size * 0.28, size * 0.2, 0, Math.PI, 0);
    ctx.fill();
  } else {
    ctx.fillStyle = '#f3d7a4';
    ctx.beginPath();
    ctx.arc(size * 0.48, size * 0.5, size * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e7c56a';
    ctx.beginPath();
    ctx.ellipse(size * 0.48, size * 0.36, size * 0.24, size * 0.16, 0, Math.PI, 0);
    ctx.fill();
  }
  ctx.restore();
}

function watchImage(image: HTMLImageElement, src: string) {
  image.decoding = 'async';
  image.src = src;
  if (image.complete) return;
  const notify = () => {
    avatarListeners.forEach((listener) => listener());
  };
  image.addEventListener('load', notify);
  image.addEventListener('error', notify);
}

export const tartagliaImage = new Image();
export const travelerImage = new Image();

type AvatarListener = () => void;
const avatarListeners = new Set<AvatarListener>();

watchImage(tartagliaImage, TARTAGLIA_SRC);
watchImage(travelerImage, TRAVELER_SRC);

export function subscribeAvatar(listener: AvatarListener) {
  avatarListeners.add(listener);
  return () => {
    avatarListeners.delete(listener);
  };
}

export function portraitReady(who: 'human' | 'ai') {
  const image = who === 'ai' ? tartagliaImage : travelerImage;
  return image.complete && image.naturalWidth > 0;
}

export function portraitSource(who: 'human' | 'ai') {
  return who === 'ai' ? tartagliaImage : travelerImage;
}
