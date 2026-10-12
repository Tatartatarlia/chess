import { EMPTY, SIZE, idx, type Cell, type Point, type Stone } from './types.ts';

const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

export function winningLine(board: Uint8Array, x: number, y: number): Point[] | null {
  const player = board[idx(x, y)];
  if (player === EMPTY) return null;

  for (const [dx, dy] of DIRS) {
    const cells: Point[] = [{ x, y }];
    for (const sign of [1, -1]) {
      for (let step = 1; step < SIZE; step++) {
        const nx = x + dx * sign * step;
        const ny = y + dy * sign * step;
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) break;
        if (board[idx(nx, ny)] !== player) break;
        cells.push({ x: nx, y: ny });
      }
    }
    if (cells.length >= 5) return cells;
  }

  return null;
}

export function isFull(board: Uint8Array): boolean {
  for (let i = 0; i < board.length; i++) {
    if (board[i] === EMPTY) return false;
  }
  return true;
}

/** Empty intersections within two steps of an existing stone. */
export function candidatePoints(board: Uint8Array): Point[] {
  const seen = new Uint8Array(SIZE * SIZE);
  const list: Point[] = [];
  let any = false;

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (board[idx(x, y)] === EMPTY) continue;
      any = true;
      for (let dy = -2; dy <= 2; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= SIZE) continue;
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= SIZE) continue;
          const j = idx(nx, ny);
          if (board[j] !== EMPTY || seen[j]) continue;
          seen[j] = 1;
          list.push({ x: nx, y: ny });
        }
      }
    }
  }

  if (!any) list.push({ x: 7, y: 7 });
  return list;
}

export function opponent(player: Stone): Stone {
  return player === 1 ? 2 : 1;
}

export function place(board: Uint8Array, x: number, y: number, player: Cell) {
  board[idx(x, y)] = player;
}
