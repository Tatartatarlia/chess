import { chooseMove } from '../src/game/ai.ts';
import { winningLine } from '../src/game/board.ts';
import { FIVE, shapeScore } from '../src/game/evaluate.ts';
import { BLACK, EMPTY, SIZE, WHITE, idx } from '../src/game/types.ts';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function emptyBoard() {
  return new Uint8Array(SIZE * SIZE);
}

function fill(board: Uint8Array, stones: readonly (readonly [number, number])[], player: number) {
  for (const [x, y] of stones) board[idx(x, y)] = player;
}

function pad(pattern: string, centerInPattern: number) {
  const chars = Array.from({ length: 11 }, () => '2');
  const start = 5 - centerInPattern;
  for (let i = 0; i < pattern.length; i++) {
    const at = start + i;
    if (at >= 0 && at < chars.length) chars[at] = pattern[i];
  }
  return chars.join('');
}

const five = shapeScore(pad('11111', 2));
const openFour = shapeScore(pad('011110', 3));
const openThree = shapeScore(pad('01110', 2));
assert(five >= FIVE, `成五分数过低: ${five}`);
assert(openFour >= 100_000 && openFour < FIVE, `活四分 ${openFour}`);
assert(openThree >= 5_000 && openThree < 12_000, `活三分 ${openThree}`);

const winBoard = emptyBoard();
fill(winBoard, [[7, 7], [7, 8], [7, 9], [7, 10]], WHITE);
fill(winBoard, [[10, 10], [10, 11], [10, 12], [10, 13]], BLACK);
const winningMove = chooseMove(winBoard, 'hard', () => 0);
assert(winningMove.x === 7 && (winningMove.y === 6 || winningMove.y === 11), `困难模式没有连五: ${winningMove.x},${winningMove.y}`);

const blockBoard = emptyBoard();
fill(blockBoard, [[7, 7], [7, 8], [7, 9], [7, 10]], BLACK);
fill(blockBoard, [[2, 2], [3, 3]], WHITE);
const block = chooseMove(blockBoard, 'normal', () => 0);
assert(block.x === 7 && (block.y === 6 || block.y === 11), `普通模式没有挡住: ${block.x},${block.y}`);
const hardBlock = chooseMove(blockBoard, 'hard', () => 0);
assert(hardBlock.x === 7 && (hardBlock.y === 6 || hardBlock.y === 11), `困难模式没有挡住: ${hardBlock.x},${hardBlock.y}`);

let easyMiss = 0;
for (let i = 0; i < 40; i++) {
  const move = chooseMove(blockBoard, 'easy', Math.random);
  assert(move.x >= 0 && move.x < SIZE && move.y >= 0 && move.y < SIZE, '简单模式落点越界');
  assert(blockBoard[idx(move.x, move.y)] === EMPTY, '简单模式落到了已有棋子上');
  const blocked = move.x === 7 && (move.y === 6 || move.y === 11);
  if (!blocked) easyMiss += 1;
}
assert(easyMiss >= 8, `简单模式几乎不失误，40 次只漏了 ${easyMiss} 次`);

const lineBoard = emptyBoard();
fill(lineBoard, [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]], BLACK);
const line = winningLine(lineBoard, 3, 3);
assert(line !== null && line.length === 5, '没有找到斜向五连');

const busy = emptyBoard();
const stones: (readonly [number, number])[] = [
  [7, 7], [8, 7], [7, 8], [9, 6], [6, 8], [8, 9], [5, 7], [10, 8], [6, 6], [9, 9],
  [4, 8], [8, 5], [7, 5], [10, 6], [5, 9],
];
stones.forEach(([x, y], index) => {
  busy[idx(x, y)] = index % 2 === 0 ? BLACK : WHITE;
});
const started = performance.now();
const hardMove = chooseMove(busy, 'hard', () => 0);
const elapsed = performance.now() - started;
assert(busy[idx(hardMove.x, hardMove.y)] === EMPTY, '困难模式落到了已有棋子上');
assert(elapsed < 800, `困难模式过慢: ${elapsed.toFixed(0)}ms`);
console.log(`selftest ok, hard move ${elapsed.toFixed(0)}ms -> ${hardMove.x},${hardMove.y}`);
