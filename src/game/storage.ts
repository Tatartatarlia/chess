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

export type SaveGame = {
  mode: GameMode;
  difficulty: Difficulty;
  humanStone: Stone;
  moves: Point[];
  undoUsed: boolean;
};

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

function isSave(value: unknown): value is SaveGame {
  if (!value || typeof value !== 'object') return false;
  const save = value as SaveGame;
  if (save.mode !== 'gomoku' || !isDifficulty(save.difficulty)) return false;
  if (save.humanStone !== BLACK && save.humanStone !== WHITE) return false;
  if (typeof save.undoUsed !== 'boolean' || !Array.isArray(save.moves)) return false;
  if (!save.moves.every(isPoint)) return false;
  return replayMoves(save.moves) !== null;
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
    record.mode === 'gomoku' &&
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
