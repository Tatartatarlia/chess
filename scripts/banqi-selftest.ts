import { chooseBanqiAction } from '../src/game/banqi/ai.ts';
import {
  BLACK,
  CANNON,
  CELL_COUNT,
  CHARIOT,
  COLOR_BIT,
  ELEPHANT,
  EMPTY,
  GENERAL,
  HORSE,
  OPEN_BIT,
  PAWN,
  RED,
  captureKind,
  commitMove,
  isLegalAction,
  isStandardLayout,
  judge,
  legalActions,
  moveTargets,
  replayBanqi,
  resultOf,
  shuffledLayout,
  standardLayout,
} from '../src/game/banqi/rules.ts';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function open(rank: number, side: typeof RED | typeof BLACK) {
  return rank | (side === BLACK ? COLOR_BIT : 0) | OPEN_BIT;
}

function hidden(rank: number, side: typeof RED | typeof BLACK) {
  return rank | (side === BLACK ? COLOR_BIT : 0);
}

const layout = standardLayout();
assert(layout.length === 32, '棋子不是 32 个');
assert(isStandardLayout(layout), '标准布局没有通过校验');
assert(layout.filter((cell) => cell === hidden(GENERAL, RED)).length === 1, '红帅数量不对');
assert(layout.filter((cell) => cell === hidden(PAWN, BLACK)).length === 5, '黑卒数量不对');
assert(layout.filter((cell) => (cell & COLOR_BIT) === 0).length === 16, '红棋不是 16 个');

assert(captureKind(GENERAL, PAWN) === 'no', '将可以吃兵了');
assert(captureKind(PAWN, GENERAL) === 'take', '兵吃不了将');
assert(captureKind(ELEPHANT, ELEPHANT) === 'both', '同大没有互吃');
assert(captureKind(CHARIOT, HORSE) === 'take', '车吃不了马');
assert(captureKind(HORSE, CHARIOT) === 'no', '马能吃车');
assert(captureKind(CANNON, GENERAL) === 'no', '炮的大小比较不应直接吃');

const board = new Uint8Array(CELL_COUNT);
board[0] = open(GENERAL, RED);
board[1] = open(PAWN, BLACK);
assert(!moveTargets(board, 0).some((target) => target.to === 1), '将走到了兵上');
assert(moveTargets(board, 1).some((target) => target.to === 0 && target.kind === 'take'), '兵没有吃将');

board[2] = open(ELEPHANT, RED);
board[3] = open(ELEPHANT, BLACK);
const elephantTargets = moveTargets(board, 2);
assert(elephantTargets.some((target) => target.to === 3 && target.kind === 'both'), '相没有和象互吃');
const traded = board.slice();
commitMove(traded, 2, 3);
assert(traded[2] === EMPTY && traded[3] === EMPTY, '互吃后棋子还在');

const cannonBoard = new Uint8Array(CELL_COUNT);
cannonBoard[0] = open(CANNON, RED);
cannonBoard[1] = open(PAWN, RED);
cannonBoard[2] = open(GENERAL, BLACK);
assert(moveTargets(cannonBoard, 0).some((target) => target.to === 2 && target.kind === 'take'), '炮没有隔一子吃到将');
assert(!moveTargets(cannonBoard, 0).some((target) => target.to === 1), '炮吃到了隔壁子');
assert(moveTargets(cannonBoard, 0).some((target) => target.to === 4 && target.kind === 'move'), '炮不能平移一格');
assert(!moveTargets(cannonBoard, 0).some((target) => target.to === 8), '炮空走超过一格');

const gapped = new Uint8Array(CELL_COUNT);
gapped[0] = open(CANNON, RED);
gapped[1] = open(PAWN, RED);
gapped[3] = open(GENERAL, BLACK);
assert(!moveTargets(gapped, 0).some((target) => target.to === 3), '炮隔了棋又隔了空格还能打到');
gapped[1] = EMPTY;
gapped[2] = open(PAWN, RED);
assert(!moveTargets(gapped, 0).some((target) => target.to === 3), '炮先空一格再隔子还能打到');

const cannonDuel = new Uint8Array(CELL_COUNT);
cannonDuel[0] = open(CANNON, RED);
cannonDuel[1] = hidden(HORSE, RED);
cannonDuel[2] = open(CANNON, BLACK);
const cannonBoth = moveTargets(cannonDuel, 0).find((target) => target.to === 2);
assert(cannonBoth?.kind === 'both', '炮吃炮没有互吃');
const afterCannon = cannonDuel.slice();
commitMove(afterCannon, 0, 2);
assert(afterCannon[0] === EMPTY && afterCannon[2] === EMPTY, '炮互吃后没有同时消失');

const blocked = new Uint8Array(CELL_COUNT);
blocked[4] = open(CHARIOT, RED);
blocked[5] = hidden(PAWN, BLACK);
blocked[6] = open(PAWN, BLACK);
assert(!moveTargets(blocked, 4).some((target) => target.to === 6), '车跳过了暗棋');

const full = shuffledLayout(() => 0.25);
assert(isStandardLayout(full), '洗牌后棋子不全');
const played = replayBanqi(full, [{ kind: 'flip', index: 0 }], true);
assert(played !== null && played.humanSide === ((full[0] & COLOR_BIT) === 0 ? RED : BLACK), '玩家第一翻没有决定颜色');
const redIndex = full.findIndex((cell) => (cell & COLOR_BIT) === 0 && cell !== full[0]);
const aiFlip = replayBanqi(
  full,
  [
    { kind: 'flip', index: 0 },
    { kind: 'flip', index: redIndex === -1 ? 1 : redIndex },
  ],
  true,
);
assert(aiFlip !== null && aiFlip.humanSide === played?.humanSide, '人机翻到红棋后改变了阵营');

function movePiece(cells: number[], index: number, piece: number) {
  const from = cells.indexOf(piece);
  assert(from >= 0, '找不到要摆的棋子');
  const swap = cells[index];
  cells[index] = cells[from];
  cells[from] = swap;
}

const endLayout = standardLayout();
movePiece(endLayout, 0, hidden(CHARIOT, RED));
movePiece(endLayout, 1, hidden(PAWN, BLACK));
const ending = replayBanqi(
  endLayout,
  [
    { kind: 'flip', index: 0 },
    { kind: 'flip', index: 1 },
    { kind: 'move', from: 0, to: 1 },
  ],
  true,
);
assert(ending !== null, '吃子回放失败');
assert(ending.humanSide === RED, '先翻红车后阵营不是红方');
assert(ending.board[0] === EMPTY && ending.board[1] === open(CHARIOT, RED), '车没有吃掉卒');

const wiped = new Uint8Array(CELL_COUNT);
wiped[0] = open(CHARIOT, RED);
wiped[1] = open(PAWN, BLACK);
wiped[4] = hidden(HORSE, RED);
commitMove(wiped, 0, 1);
assert(judge(wiped, RED) === 'win', '吃光对方没有获胜');
assert(resultOf(wiped, RED, false) === 'win', '胜利结算不对');

const drawn = new Uint8Array(CELL_COUNT);
drawn[0] = open(ELEPHANT, RED);
drawn[1] = open(ELEPHANT, BLACK);
commitMove(drawn, 0, 1);
assert(drawn[0] === EMPTY && drawn[1] === EMPTY, '最后两子没有同时消失');
assert(judge(drawn, RED) === 'draw', '最后互吃没有和局');

const stall = new Uint8Array(CELL_COUNT);
stall[0] = open(PAWN, RED);
stall[1] = open(ELEPHANT, BLACK);
stall[4] = open(ELEPHANT, BLACK);
assert(legalActions(stall, RED).every((action) => action.kind !== 'move'), '被堵住的兵还能走');
assert(resultOf(stall, RED, true) === 'lose', '无子可走没有判负');

const cheatA = standardLayout();
cheatA[0] = hidden(PAWN, BLACK);
cheatA[1] = open(GENERAL, RED);
cheatA[2] = hidden(ELEPHANT, BLACK);
const cheatB = cheatA.slice();
const swap = cheatB[0];
cheatB[0] = cheatB[2];
cheatB[2] = swap;
const pickA = chooseBanqiAction(Uint8Array.from(cheatA), 'hard', () => 0.2, BLACK, null);
const pickB = chooseBanqiAction(Uint8Array.from(cheatB), 'hard', () => 0.2, BLACK, null);
assert(pickA.kind === 'flip' && pickB.kind === 'flip' && pickA.index === pickB.index, '困难人机看穿了暗棋');

const tactic = new Uint8Array(CELL_COUNT);
const tacticLayout = standardLayout();
for (let i = 0; i < CELL_COUNT; i += 1) tactic[i] = tacticLayout[i];
tactic[0] = open(PAWN, RED);
tactic[1] = open(GENERAL, BLACK);
const normalTake = chooseBanqiAction(tactic, 'normal', () => 0, RED, null);
const hardTake = chooseBanqiAction(tactic, 'hard', () => 0, RED, null);
assert(normalTake.kind === 'move' && normalTake.to === 1, `普通没有吃将: ${JSON.stringify(normalTake)}`);
assert(hardTake.kind === 'move' && hardTake.to === 1, `困难没有吃将: ${JSON.stringify(hardTake)}`);
assert(isLegalAction(tactic, RED, hardTake), '困难走出了非法着法');

const started = performance.now();
const busy = shuffledLayout(() => 0.4);
busy[0] = open(CHARIOT, RED);
const hardMove = chooseBanqiAction(Uint8Array.from(busy), 'hard', () => 0.3, RED, null);
const elapsed = performance.now() - started;
assert(isLegalAction(Uint8Array.from(busy), RED, hardMove), '困难着法非法');
assert(elapsed < 800, `困难思考过慢: ${elapsed.toFixed(0)}ms`);

let cursor = Uint8Array.from(shuffledLayout(() => 0.15));
let side: typeof RED | typeof BLACK | null = null;
for (let ply = 0; ply < 80; ply += 1) {
  const human = ply % 2 === 0;
  const actor = human ? side : side === null ? null : side === RED ? BLACK : RED;
  if (resultOf(cursor, side, human) !== 'playing') break;
  const action = chooseBanqiAction(cursor, ply % 2 === 0 ? 'easy' : 'normal', () => ((ply * 17) % 10) / 10, actor, null);
  assert(isLegalAction(cursor, actor, action), `第 ${ply} 手非法`);
  if (action.kind === 'flip') {
    const revealed = cursor[action.index] | OPEN_BIT;
    if (human && side === null) side = (cursor[action.index] & COLOR_BIT) === 0 ? RED : BLACK;
    cursor[action.index] = revealed;
  } else {
    commitMove(cursor, action.from, action.to);
  }
}

console.log(`banqi selftest ok, hard ${elapsed.toFixed(0)}ms`);
