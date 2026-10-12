export const SIZE = 15;
export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;

export type Cell = typeof EMPTY | typeof BLACK | typeof WHITE;
export type Stone = typeof BLACK | typeof WHITE;
export type Difficulty = 'easy' | 'normal' | 'hard';
export type Point = { x: number; y: number };
export type Status = 'playing' | 'win' | 'lose' | 'draw';

export const idx = (x: number, y: number) => y * SIZE + x;

export type GameMode = 'gomoku' | 'banqi';

export type AiRequest = {
  id: number;
  board: Uint8Array;
  difficulty: Difficulty;
  ai: Stone;
};

export type AiResponse = {
  id: number;
  x: number;
  y: number;
};
