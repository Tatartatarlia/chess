import {
  isHumanTurn,
  isStandardLayout,
  replayBanqi,
  resultOf,
  type BanqiMove,
} from './banqi/rules.ts';
import { BLACK, EMPTY, SIZE, WHITE, idx, type Difficulty, type GameMode, type Point, type Status, type Stone } from './types.ts';

const SAVE_KEY = 'dada-chess-save';
const HISTORY_KEY = 'dada-chess-history';
export const HISTORY_LIMIT = 10;

export type MatchRecord = {
  mode: GameMode;
  difficulty: Difficulty;
  result: Exclude<Status, 'playing'>;
  at: number;
};

export type GomokuSave = {
  mode: 'gomoku';
  difficulty: Difficulty;
  humanStone: Stone;
  moves: Point[];
  undoUsed: boolean;
};

export type BanqiSave = {
  mode: 'banqi';
  difficulty: Difficulty;
  humanFirst: boolean;
  layout: number[];
  moves: BanqiMove[];
  undoUsed: boolean;
};

export type SaveGame = GomokuSave | BanqiSave;

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];

function isPoint(value: unknown): value is Point {
  if (!value || typeof value !== 'object') return false;
  const point = value as Point;
  return (
    Number.isInteger(point.x) &&
    Number.isInteger(point.y) &&
    point.x >= 0 &&
    point.y >= 0 &&
    point.x < SIZE &&
    point.y < SIZE
  );
}

function isDifficulty(value: unknown): value is Difficulty {
  return DIFFICULTIES.includes(value as Difficulty);
}

function isBanqiMove(value: unknown): value is BanqiMove {
  if (!value || typeof value !== 'object') return false;
  const move = value as BanqiMove;
  if (move.kind === 'flip') return Number.isInteger(move.index) && move.index >= 0 && move.index < 32;
  if (move.kind === 'move') {
    return [move.from, move.to].every((index) => Number.isInteger(index) && index >= 0 && index < 32);
  }
  return false;
}

export function stoneAtMove(index: number): Stone {
  return index % 2 === 0 ? BLACK : WHITE;
}

export function replayMoves(moves: readonly Point[]) {
  const board = new Uint8Array(SIZE * SIZE);
  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const at = idx(move.x, move.y);
    if (board[at] !== EMPTY) return null;
    board[at] = stoneAtMove(i);
  }
  return board;
}

function isGomokuSave(value: SaveGame): value is GomokuSave {
  return (
    value.mode === 'gomoku' &&
    isDifficulty(value.difficulty) &&
    (value.humanStone === BLACK || value.humanStone === WHITE) &&
    typeof value.undoUsed === 'boolean' &&
    Array.isArray(value.moves) &&
    value.moves.every(isPoint) &&
    replayMoves(value.moves) !== null
  );
}

function isBanqiSave(value: SaveGame): value is BanqiSave {
  if (value.mode !== 'banqi' || !isDifficulty(value.difficulty)) return false;
  if (typeof value.humanFirst !== 'boolean' || typeof value.undoUsed !== 'boolean') return false;
  if (!Array.isArray(value.layout) || !Array.isArray(value.moves)) return false;
  if (value.moves.length > 400 || !value.moves.every(isBanqiMove)) return false;
  if (!isStandardLayout(value.layout)) return false;
  const position = replayBanqi(value.layout, value.moves, value.humanFirst);
  if (!position) return false;
  return resultOf(position.board, position.humanSide, isHumanTurn(value.moves.length, value.humanFirst)) === 'playing';
}

function isSave(value: unknown): value is SaveGame {
  if (!value || typeof value !== 'object') return false;
  const save = value as SaveGame;
  if (save.mode === 'gomoku') return isGomokuSave(save);
  if (save.mode === 'banqi') return isBanqiSave(save);
  return false;
}

export function loadSave(): SaveGame | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isSave(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeSave(save: SaveGame) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}

export function clearSave() {
  localStorage.removeItem(SAVE_KEY);
}

function isRecord(value: unknown): value is MatchRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as MatchRecord;
  return (
    (record.mode === 'gomoku' || record.mode === 'banqi') &&
    isDifficulty(record.difficulty) &&
    (record.result === 'win' || record.result === 'lose' || record.result === 'draw') &&
    typeof record.at === 'number'
  );
}

export function loadHistory(): MatchRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecord).slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

export function pushHistory(record: MatchRecord) {
  const next = [record, ...loadHistory()].slice(0, HISTORY_LIMIT);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}

export function humanHasMoved(moves: readonly Point[], humanStone: Stone) {
  return moves.some((_, index) => stoneAtMove(index) === humanStone);
}
