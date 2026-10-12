import type { Status } from '../types.ts';

export const COLS = 4;
export const ROWS = 8;
export const CELL_COUNT = COLS * ROWS;

export const EMPTY = 0;
export const HIDDEN_MARK = 32;
export const OPEN_BIT = 16;
export const COLOR_BIT = 8;

export const PAWN = 1;
export const CANNON = 2;
export const HORSE = 3;
export const CHARIOT = 4;
export const ELEPHANT = 5;
export const ADVISOR = 6;
export const GENERAL = 7;

export const RED = 1;
export const BLACK = 2;

export type Side = typeof RED | typeof BLACK;
export type CaptureKind = 'move' | 'take' | 'both';

export type BanqiMove =
  | { kind: 'flip'; index: number }
  | { kind: 'move'; from: number; to: number };

const ORTHO: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const RANK_LIST = [
  GENERAL,
  ADVISOR,
  ADVISOR,
  ELEPHANT,
  ELEPHANT,
  CHARIOT,
  CHARIOT,
  HORSE,
  HORSE,
  CANNON,
  CANNON,
  PAWN,
  PAWN,
  PAWN,
  PAWN,
  PAWN,
] as const;

export const RED_CHAR = ['', '兵', '炮', '马', '车', '相', '仕', '帅'] as const;
export const BLACK_CHAR = ['', '卒', '砲', '馬', '車', '象', '士', '将'] as const;

export function opposite(side: Side): Side {
  return side === RED ? BLACK : RED;
}

export function sideOf(cell: number): Side {
  return (cell & COLOR_BIT) === 0 ? RED : BLACK;
}

export function isHidden(cell: number) {
  if (cell === EMPTY) return false;
  if (cell === HIDDEN_MARK) return true;
  return (cell & OPEN_BIT) === 0;
}

export function isRevealed(cell: number) {
  return cell !== EMPTY && cell !== HIDDEN_MARK && (cell & OPEN_BIT) !== 0;
}

export function pieceChar(cell: number) {
  const rank = cell & 7;
  if (rank < 1 || rank > 7) return '';
  return sideOf(cell) === RED ? RED_CHAR[rank] : BLACK_CHAR[rank];
}

export function isHumanTurn(ply: number, humanFirst: boolean) {
  return humanFirst ? ply % 2 === 0 : ply % 2 === 1;
}

export function standardLayout(): number[] {
  const bag: number[] = [];
  for (const side of [RED, BLACK]) {
    const mark = side === BLACK ? COLOR_BIT : 0;
    for (const rank of RANK_LIST) bag.push(rank | mark);
  }
  return bag;
}

export function isStandardLayout(layout: readonly number[]) {
  if (layout.length !== CELL_COUNT) return false;
  const counts = new Uint8Array(16);
  for (const cell of layout) {
    if (!Number.isInteger(cell) || cell < 1 || cell > 15 || (cell & 7) === 0) return false;
    counts[cell] += 1;
  }
  const expected = new Uint8Array(16);
  for (const cell of standardLayout()) expected[cell] += 1;
  for (let i = 0; i < expected.length; i += 1) {
    if (counts[i] !== expected[i]) return false;
  }
  return true;
}

export function shuffledLayout(rng: () => number) {
  const bag = standardLayout();
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const swap = bag[i];
    bag[i] = bag[j];
    bag[j] = swap;
  }
  return bag;
}

export function captureKind(attackerRank: number, defenderRank: number): 'no' | 'take' | 'both' {
  if (attackerRank === GENERAL && defenderRank === PAWN) return 'no';
  if (attackerRank === PAWN && defenderRank === GENERAL) return 'take';
  if (attackerRank === defenderRank) return 'both';
  if (attackerRank > defenderRank) return 'take';
  return 'no';
}

function step(index: number, dx: number, dy: number) {
  const x = index % COLS;
  const y = (index / COLS) | 0;
  const nx = x + dx;
  const ny = y + dy;
  if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) return null;
  return ny * COLS + nx;
}

export function moveTargets(board: Uint8Array, from: number): { to: number; kind: CaptureKind }[] {
  const cell = board[from];
  if (!isRevealed(cell)) return [];
  const rank = cell & 7;
  const side = sideOf(cell);
  const targets: { to: number; kind: CaptureKind }[] = [];

  for (const [dx, dy] of ORTHO) {
    if (rank === CANNON) {
      const adjacent = step(from, dx, dy);
      if (adjacent === null) continue;
      if (board[adjacent] === EMPTY) {
        targets.push({ to: adjacent, kind: 'move' });
        continue;
      }
      const beyond = step(adjacent, dx, dy);
      if (beyond === null) continue;
      const at = board[beyond];
      if (isRevealed(at) && sideOf(at) !== side) {
        targets.push({ to: beyond, kind: (at & 7) === CANNON ? 'both' : 'take' });
      }
      continue;
    }

    const to = step(from, dx, dy);
    if (to === null) continue;
    const at = board[to];
    if (at === EMPTY) {
      targets.push({ to, kind: 'move' });
      continue;
    }
    if (!isRevealed(at) || sideOf(at) === side) continue;
    const kind = captureKind(rank, at & 7);
    if (kind === 'take' || kind === 'both') targets.push({ to, kind });
  }

  return targets;
}

export function legalActions(board: Uint8Array, side: Side | null): BanqiMove[] {
  const actions: BanqiMove[] = [];
  for (let i = 0; i < CELL_COUNT; i += 1) {
    if (isHidden(board[i])) actions.push({ kind: 'flip', index: i });
  }
  if (side === null) return actions;
  for (let i = 0; i < CELL_COUNT; i += 1) {
    const cell = board[i];
    if (!isRevealed(cell) || sideOf(cell) !== side) continue;
    for (const target of moveTargets(board, i)) actions.push({ kind: 'move', from: i, to: target.to });
  }
  return actions;
}

export function isLegalAction(board: Uint8Array, side: Side | null, action: BanqiMove) {
  if (action.kind === 'flip') {
    return action.index >= 0 && action.index < CELL_COUNT && isHidden(board[action.index]);
  }
  if (side === null) return false;
  if (action.from < 0 || action.to < 0 || action.from >= CELL_COUNT || action.to >= CELL_COUNT) return false;
  const cell = board[action.from];
  if (!isRevealed(cell) || sideOf(cell) !== side) return false;
  return moveTargets(board, action.from).some((target) => target.to === action.to);
}

export function commitMove(board: Uint8Array, from: number, to: number) {
  const attacker = board[from];
  const target = board[to];
  board[from] = EMPTY;
  if (target === EMPTY) {
    board[to] = attacker;
    return;
  }
  const attackRank = attacker & 7;
  const defendRank = target & 7;
  const both =
    attackRank === defendRank ||
    (attackRank !== CANNON && captureKind(attackRank, defendRank) === 'both');
  board[to] = both ? EMPTY : attacker;
}

export function sideCounts(board: Uint8Array) {
  let red = 0;
  let black = 0;
  for (let i = 0; i < CELL_COUNT; i += 1) {
    const cell = board[i];
    if (cell === EMPTY || cell === HIDDEN_MARK || (cell & 7) === 0) continue;
    if ((cell & COLOR_BIT) === 0) red += 1;
    else black += 1;
  }
  return { red, black };
}

export function judge(board: Uint8Array, humanSide: Side | null): Status {
  if (humanSide === null) return 'playing';
  const { red, black } = sideCounts(board);
  const mine = humanSide === RED ? red : black;
  const theirs = humanSide === RED ? black : red;
  if (mine === 0 && theirs === 0) return 'draw';
  if (theirs === 0) return 'win';
  if (mine === 0) return 'lose';
  return 'playing';
}

export function resultOf(board: Uint8Array, humanSide: Side | null, humanToMove: boolean): Status {
  const judged = judge(board, humanSide);
  if (judged !== 'playing') return judged;
  const side = humanToMove ? humanSide : humanSide === null ? null : opposite(humanSide);
  if (legalActions(board, side).length === 0) return humanToMove ? 'lose' : 'win';
  return 'playing';
}

export function replayBanqi(layout: readonly number[], moves: readonly BanqiMove[], humanFirst: boolean) {
  if (!isStandardLayout(layout)) return null;
  const board = Uint8Array.from(layout);
  let humanSide: Side | null = null;
  for (let ply = 0; ply < moves.length; ply += 1) {
    const human = isHumanTurn(ply, humanFirst);
    const side = human ? humanSide : humanSide === null ? null : opposite(humanSide);
    const move = moves[ply];
    if (!isLegalAction(board, side, move)) return null;
    if (move.kind === 'flip') {
      const hidden = board[move.index];
      board[move.index] = hidden | OPEN_BIT;
      if (human && humanSide === null) humanSide = sideOf(hidden);
    } else {
      commitMove(board, move.from, move.to);
    }
  }
  return { board, humanSide };
}
