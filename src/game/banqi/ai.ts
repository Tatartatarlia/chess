import type { Difficulty } from '../types.ts';
import {
  BLACK,
  CANNON,
  CELL_COUNT,
  COLS,
  COLOR_BIT,
  ROWS,
  EMPTY,
  HIDDEN_MARK,
  OPEN_BIT,
  captureKind,
  commitMove,
  isRevealed,
  legalActions,
  moveTargets,
  opposite,
  sideOf,
  type BanqiMove,
  type Side,
} from './rules.ts';

const RANK_VALUE = [0, 40, 70, 80, 120, 170, 220, 520];

export type BanqiAiRequest = {
  id: number;
  board: Uint8Array;
  difficulty: Difficulty;
  aiSide: Side | null;
  avoid: { from: number; to: number } | null;
};

export type BanqiAiResponse = {
  id: number;
  action: BanqiMove;
};

type View = {
  board: Uint8Array;
  bag: Uint8Array;
};

function toView(board: Uint8Array): View {
  const masked = board.slice();
  const bag = new Uint8Array(16);
  for (let i = 0; i < CELL_COUNT; i += 1) {
    const cell = board[i];
    if (cell !== EMPTY && (cell & OPEN_BIT) === 0) {
      bag[cell & 15] += 1;
      masked[i] = HIDDEN_MARK;
    }
  }
  return { board: masked, bag };
}

function count(view: View, side: Side) {
  let total = 0;
  for (let i = 0; i < CELL_COUNT; i += 1) {
    const cell = view.board[i];
    if (isRevealed(cell) && sideOf(cell) === side) total += 1;
  }
  for (let rank = 1; rank <= 7; rank += 1) {
    total += view.bag[rank | (side === BLACK ? COLOR_BIT : 0)];
  }
  return total;
}

function material(view: View, side: Side) {
  let total = 0;
  for (let i = 0; i < CELL_COUNT; i += 1) {
    const cell = view.board[i];
    if (isRevealed(cell) && sideOf(cell) === side) total += RANK_VALUE[cell & 7];
  }
  for (let rank = 1; rank <= 7; rank += 1) {
    total += view.bag[rank | (side === BLACK ? COLOR_BIT : 0)] * RANK_VALUE[rank];
  }
  return total;
}

function tactics(board: Uint8Array, side: Side) {
  let score = 0;
  for (let i = 0; i < CELL_COUNT; i += 1) {
    const cell = board[i];
    if (!isRevealed(cell) || sideOf(cell) !== side) continue;
    const rank = cell & 7;
    for (const target of moveTargets(board, i)) {
      if (target.kind === 'move') {
        score += 3;
        continue;
      }
      if (target.kind === 'both') {
        score += 6;
        continue;
      }
      const victim = board[target.to];
      score += rank === CANNON || captureKind(rank, victim & 7) === 'take' ? RANK_VALUE[victim & 7] : 0;
    }
  }
  return score;
}

function evaluate(view: View, side: Side) {
  const opp = opposite(side);
  const mine = count(view, side);
  const theirs = count(view, opp);
  if (mine === 0 && theirs === 0) return 0;
  if (theirs === 0) return 1_000_000;
  if (mine === 0) return -1_000_000;
  return material(view, side) - material(view, opp) + tactics(view.board, side) * 0.22 - tactics(view.board, opp) * 0.62;
}

function withFlip(view: View, index: number, typeId: number): View {
  const board = view.board.slice();
  const bag = view.bag.slice();
  bag[typeId] -= 1;
  board[index] = typeId | OPEN_BIT;
  return { board, bag };
}

function withMove(view: View, action: Extract<BanqiMove, { kind: 'move' }>): View {
  const board = view.board.slice();
  commitMove(board, action.from, action.to);
  return { board, bag: view.bag };
}

function rateFlip(view: View, index: number, side: Side) {
  let total = 0;
  let score = 0;
  for (let rank = 1; rank <= 7; rank += 1) {
    for (const mark of [0, COLOR_BIT]) {
      const id = rank | mark;
      const amount = view.bag[id];
      if (amount === 0) continue;
      total += amount;
      score += amount * evaluate(withFlip(view, index, id), side);
    }
  }
  return total === 0 ? 0 : score / total;
}

function forcedWin(board: Uint8Array, aiSide: Side) {
  const humanSide = opposite(aiSide);
  for (const action of legalActions(board, aiSide)) {
    if (action.kind !== 'move') continue;
    const next = board.slice();
    commitMove(next, action.from, action.to);
    const oppLeft = count(toView(next), humanSide);
    const mineLeft = count(toView(next), aiSide);
    if (oppLeft === 0 && mineLeft > 0) return action;
    if (oppLeft > 0 && legalActions(next, humanSide).length === 0) return action;
  }
  return null;
}

function centerDistance(index: number) {
  const x = index % COLS;
  const y = (index / COLS) | 0;
  return Math.abs(x - (COLS - 1) / 2) + Math.abs(y - (ROWS - 1) / 2);
}

function chooseBlind(actions: BanqiMove[], difficulty: Difficulty, rng: () => number) {
  const flips = actions.filter((action) => action.kind === 'flip');
  const pool = flips.length > 0 ? flips : actions;
  if (difficulty === 'hard') {
    const ranked = [...pool].sort((a, b) => {
      const aIndex = a.kind === 'flip' ? a.index : a.to;
      const bIndex = b.kind === 'flip' ? b.index : b.to;
      return centerDistance(aIndex) - centerDistance(bIndex);
    });
    const top = ranked.slice(0, Math.min(8, ranked.length));
    return top[Math.floor(rng() * top.length)];
  }
  return pool[Math.floor(rng() * pool.length)];
}

function chooseEasy(board: Uint8Array, actions: BanqiMove[], aiSide: Side, rng: () => number) {
  const win = forcedWin(board, aiSide);
  if (win && rng() < 0.34) return win;
  const captures = actions.filter((action) => action.kind === 'move' && isRevealed(board[action.to]));
  if (captures.length > 0 && rng() < 0.4) return captures[Math.floor(rng() * captures.length)];
  return actions[Math.floor(rng() * actions.length)];
}

function undoPenalty(action: BanqiMove, avoid: { from: number; to: number } | null) {
  if (!avoid || action.kind !== 'move') return 0;
  return action.from === avoid.to && action.to === avoid.from ? 36 : 0;
}

function rateAction(view: View, action: BanqiMove, side: Side) {
  if (action.kind === 'flip') return rateFlip(view, action.index, side);
  return evaluate(withMove(view, action), side);
}

function chooseNormal(board: Uint8Array, aiSide: Side, rng: () => number, avoid: { from: number; to: number } | null) {
  const win = forcedWin(board, aiSide);
  if (win) return win;
  const view = toView(board);
  const actions = legalActions(view.board, aiSide);
  let best = actions[0];
  let bestScore = -Infinity;
  for (const action of actions) {
    const score = rateAction(view, action, aiSide) - undoPenalty(action, avoid) + (rng() - 0.5) * 16;
    if (score > bestScore) {
      best = action;
      bestScore = score;
    }
  }
  return best;
}

function replyValue(view: View, side: Side) {
  const opp = opposite(side);
  const replies = legalActions(view.board, opp);
  if (replies.length === 0) {
    const mine = count(view, side);
    const theirs = count(view, opp);
    if (mine === 0 && theirs === 0) return 0;
    return 1_000_000;
  }
  let worst = Infinity;
  for (const reply of replies) {
    const value = reply.kind === 'flip' ? rateFlip(view, reply.index, side) : evaluate(withMove(view, reply), side);
    if (value < worst) worst = value;
  }
  return worst;
}

function chooseHard(board: Uint8Array, aiSide: Side, avoid: { from: number; to: number } | null) {
  const win = forcedWin(board, aiSide);
  if (win) return win;
  const view = toView(board);
  const actions = legalActions(view.board, aiSide);
  const deadline = performance.now() + 260;
  let best = actions[0];
  let bestScore = -Infinity;
  for (const action of actions) {
    if (performance.now() > deadline && bestScore > -Infinity) break;
    const next = action.kind === 'flip' ? null : withMove(view, action);
    const score =
      (action.kind === 'flip' ? rateFlip(view, action.index, aiSide) : replyValue(next as View, aiSide)) -
      undoPenalty(action, avoid);
    if (score > bestScore) {
      best = action;
      bestScore = score;
    }
  }
  return best;
}

export function chooseBanqiAction(
  board: Uint8Array,
  difficulty: Difficulty,
  rng: () => number,
  aiSide: Side | null,
  avoid: { from: number; to: number } | null = null,
): BanqiMove {
  const actions = legalActions(board, aiSide);
  if (actions.length === 0) return { kind: 'flip', index: -1 };
  if (aiSide === null) return chooseBlind(actions, difficulty, rng);
  if (difficulty === 'easy') return chooseEasy(board, actions, aiSide, rng);
  if (difficulty === 'normal') return chooseNormal(board, aiSide, rng, avoid);
  return chooseHard(board, aiSide, avoid);
}
