import { EMPTY, SIZE, idx, type Cell, type Point, type Stone } from './types.ts';
import { candidatePoints, opponent } from './board.ts';

export const FIVE = 1_000_000;
export const OPEN_FOUR = 100_000;

const RADIUS = 5;
const CENTER = RADIUS;

const SHAPES: readonly (readonly [string, number])[] = [
  ['11111', FIVE],
  ['011110', OPEN_FOUR],
  ['011112', 12_000],
  ['211110', 12_000],
  ['11101', 11_000],
  ['10111', 11_000],
  ['11011', 11_000],
  ['011101', 11_000],
  ['101110', 11_000],
  ['110110', 11_000],
  ['011011', 11_000],
  ['0011100', 6_500],
  ['011100', 5_200],
  ['001110', 5_200],
  ['01110', 5_000],
  ['010110', 4_800],
  ['011010', 4_800],
  ['211100', 700],
  ['001112', 700],
  ['211010', 520],
  ['010112', 520],
  ['210110', 520],
  ['011012', 520],
  ['001100', 200],
  ['001010', 200],
  ['010100', 200],
  ['010010', 180],
  ['011000', 160],
  ['000110', 160],
];

const lineChars = new Array<string>(RADIUS * 2 + 1);

/** Highest shape created by the stone just played at the center of `line`. */
export function shapeScore(line: string): number {
  let best = 0;
  for (let s = 0; s < SHAPES.length; s++) {
    const pat = SHAPES[s][0];
    const score = SHAPES[s][1];
    if (score <= best) continue;
    let from = 0;
    while (from <= line.length - pat.length) {
      const at = line.indexOf(pat, from);
      if (at < 0) break;
      if (at <= CENTER && at + pat.length - 1 >= CENTER) {
        best = score;
        break;
      }
      from = at + 1;
    }
  }
  return best;
}

function buildLine(board: Uint8Array, x: number, y: number, dx: number, dy: number, player: Cell): string {
  for (let i = -RADIUS; i <= RADIUS; i++) {
    if (i === 0) {
      lineChars[i + RADIUS] = '1';
      continue;
    }
    const nx = x + dx * i;
    const ny = y + dy * i;
    if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) {
      lineChars[i + RADIUS] = '2';
      continue;
    }
    const cell = board[idx(nx, ny)];
    lineChars[i + RADIUS] = cell === EMPTY ? '0' : cell === player ? '1' : '2';
  }
  return lineChars.join('');
}

const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

/** Value of hypothetically playing `player` at an empty point. */
export function scoreAt(board: Uint8Array, x: number, y: number, player: Cell): number {
  let total = 0;
  for (let d = 0; d < DIRS.length; d++) {
    total += shapeScore(buildLine(board, x, y, DIRS[d][0], DIRS[d][1], player));
  }
  return total;
}

export type ScoredMove = Point & {
  attack: number;
  defense: number;
  score: number;
};

export function rankMoves(board: Uint8Array, player: Stone): ScoredMove[] {
  const opp = opponent(player);
  const points = candidatePoints(board);
  const ranked: ScoredMove[] = [];

  for (let i = 0; i < points.length; i++) {
    const { x, y } = points[i];
    const attack = scoreAt(board, x, y, player);
    const defense = scoreAt(board, x, y, opp);
    const bias = (14 - Math.abs(x - 7) - Math.abs(y - 7)) * 12;
    let score = attack + defense * 1.12 + bias;
    if (attack >= FIVE) score += FIVE;
    ranked.push({ x, y, attack, defense, score });
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

export function bestAttack(board: Uint8Array, player: Stone): number {
  const points = candidatePoints(board);
  let best = 0;
  for (let i = 0; i < points.length; i++) {
    const value = scoreAt(board, points[i].x, points[i].y, player);
    if (value >= FIVE) return FIVE;
    if (value > best) best = value;
  }
  return best;
}
