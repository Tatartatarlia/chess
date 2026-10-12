import { EMPTY, WHITE, idx, type Difficulty, type Point, type Stone } from './types.ts';
import { opponent } from './board.ts';
import { FIVE, OPEN_FOUR, bestAttack, rankMoves, type ScoredMove } from './evaluate.ts';

function pickWeighted(moves: ScoredMove[], temperature: number, rng: () => number): ScoredMove {
  let max = moves[0].score;
  for (let i = 1; i < moves.length; i++) {
    if (moves[i].score > max) max = moves[i].score;
  }
  let sum = 0;
  const weights = new Array<number>(moves.length);
  for (let i = 0; i < moves.length; i++) {
    const weight = Math.exp((moves[i].score - max) / temperature);
    weights[i] = weight;
    sum += weight;
  }
  let ticket = rng() * sum;
  for (let i = 0; i < moves.length; i++) {
    ticket -= weights[i];
    if (ticket <= 0) return moves[i];
  }
  return moves[moves.length - 1];
}

function chooseEasy(board: Uint8Array, player: Stone, rng: () => number): Point {
  const ranked = rankMoves(board, player);
  if (ranked.length === 0) return { x: 7, y: 7 };

  const win = ranked.find((move) => move.attack >= FIVE);
  if (win && rng() < 0.68) return win;

  const block = ranked.find((move) => move.defense >= FIVE);
  if (block && rng() < 0.32) return block;

  const careless = ranked.filter((move) => move.attack < FIVE && move.defense < FIVE);
  if (rng() < 0.2 && careless.length > 0) {
    const bag = careless.slice(0, 14);
    return bag[Math.floor(rng() * bag.length)];
  }

  const relaxed = careless.filter((move) => move.defense < OPEN_FOUR).slice(0, 8);
  const pool = relaxed.length > 0 ? relaxed : careless.slice(0, 8);
  if (pool.length === 0) return ranked[0];
  return pickWeighted(pool, 2800, rng);
}

function chooseNormal(board: Uint8Array, player: Stone, rng: () => number): Point {
  const ranked = rankMoves(board, player);
  if (ranked.length === 0) return { x: 7, y: 7 };

  const win = ranked.find((move) => move.attack >= FIVE);
  if (win) return win;

  const block = ranked.find((move) => move.defense >= FIVE);
  if (block) return block;

  const second = ranked[1];
  if (!second || ranked[0].score > second.score * 1.18 || rng() < 0.82) return ranked[0];
  return second;
}

function negamax(
  board: Uint8Array,
  depth: number,
  alpha: number,
  beta: number,
  player: Stone,
  deadline: number,
): number {
  if (performance.now() > deadline) return Number.NaN;

  if (depth === 0) {
    const mine = bestAttack(board, player);
    if (mine >= FIVE) return FIVE;
    return mine - bestAttack(board, opponent(player));
  }

  const ranked = rankMoves(board, player);
  if (ranked.length === 0) return 0;
  if (ranked[0].attack >= FIVE) return FIVE + depth * 50;

  const width = depth >= 2 ? 8 : 6;
  const opp = opponent(player);
  let best = -Infinity;

  for (let i = 0; i < ranked.length && i < width; i++) {
    const move = ranked[i];
    const at = idx(move.x, move.y);
    board[at] = player;
    const value =
      move.attack >= FIVE ? FIVE + depth * 50 : -negamax(board, depth - 1, -beta, -alpha, opp, deadline);
    board[at] = EMPTY;

    if (Number.isNaN(value)) return best === -Infinity ? ranked[0].score : best;
    if (value > best) best = value;
    if (value > alpha) alpha = value;
    if (alpha >= beta) break;
  }

  return best;
}

function chooseHard(board: Uint8Array, player: Stone): Point {
  const ranked = rankMoves(board, player);
  if (ranked.length === 0) return { x: 7, y: 7 };

  const win = ranked.find((move) => move.attack >= FIVE);
  if (win) return win;

  const blocks = ranked.filter((move) => move.defense >= FIVE);
  if (blocks.length > 0) return blocks[0];

  const deadline = performance.now() + 260;
  const root = ranked.slice(0, 12);
  let best = root[0];
  let bestValue = -Infinity;
  const opp = opponent(player);

  for (let i = 0; i < root.length; i++) {
    if (performance.now() > deadline) break;
    const move = root[i];
    const at = idx(move.x, move.y);
    board[at] = player;
    const value = -negamax(board, 2, -Infinity, Infinity, opp, deadline);
    board[at] = EMPTY;
    const judged = Number.isNaN(value) ? move.score : value;
    if (judged > bestValue) {
      bestValue = judged;
      best = move;
    }
  }

  return best;
}

export function chooseMove(
  source: Uint8Array,
  difficulty: Difficulty,
  rng: () => number = Math.random,
  aiStone: Stone = WHITE,
): Point {
  const board = new Uint8Array(source);
  if (difficulty === 'easy') return chooseEasy(board, aiStone, rng);
  if (difficulty === 'normal') return chooseNormal(board, aiStone, rng);
  return chooseHard(board, aiStone);
}
