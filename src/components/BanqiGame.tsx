import { useCallback, useEffect, useRef, useState } from 'react';
import { chooseBanqiAction, type BanqiAiResponse } from '../game/banqi/ai.ts';
import {
  BLACK,
  DRAW_AFTER_MOVES,
  RED,
  isHidden,
  isHumanTurn,
  isLegalAction,
  isRevealed,
  moveTargets,
  opposite,
  replayBanqi,
  resultOf,
  sideCounts,
  sideOf,
  type BanqiMove,
  type Side,
} from '../game/banqi/rules.ts';
import { writeSave, type BanqiSave } from '../game/storage.ts';
import type { Difficulty, Status } from '../game/types.ts';
import { BanqiBoard } from './BanqiBoard.tsx';
import { Portrait } from './Portrait.tsx';

const THINK_MS: Record<Difficulty, number> = {
  easy: 280,
  normal: 380,
  hard: 200,
};

const LEVEL_LABEL: Record<Difficulty, string> = {
  easy: '简单',
  normal: '普通',
  hard: '困难',
};

type DrawStep = 'draw' | 'result' | null;

type BanqiGameProps = {
  launch: BanqiSave;
  announce: boolean;
  hint: string;
  onHome: () => void;
  onFinish: (result: Exclude<Status, 'playing'>, difficulty: Difficulty) => void;
};

function sideText(side: Side | null, first: boolean) {
  const color = side === RED ? '红方' : side === BLACK ? '黑方' : '颜色未定';
  return `${color} · ${first ? '先手' : '后手'}`;
}

function chipClass(side: Side | null) {
  if (side === RED) return 'chip red';
  if (side === BLACK) return 'chip black';
  return 'chip';
}

function chipText(side: Side | null) {
  if (side === RED) return '红';
  if (side === BLACK) return '黑';
  return '？';
}

export function BanqiGame({ launch, announce, hint, onHome, onFinish }: BanqiGameProps) {
  const { layout, humanFirst, difficulty } = launch;
  const [board, setBoard] = useState(
    () => replayBanqi(layout, launch.moves, humanFirst)?.board ?? Uint8Array.from(layout),
  );
  const [moves, setMoves] = useState<BanqiMove[]>(() => launch.moves.slice());
  const [humanSide, setHumanSide] = useState<Side | null>(
    () => replayBanqi(layout, launch.moves, humanFirst)?.humanSide ?? null,
  );
  const [status, setStatus] = useState<Status>('playing');
  const [undoUsed, setUndoUsed] = useState(launch.undoUsed);
  const [selected, setSelected] = useState<number | null>(null);
  const [surrendered, setSurrendered] = useState(false);
  const [drawStep, setDrawStep] = useState<DrawStep>(announce ? 'draw' : null);

  const workerRef = useRef<Worker | null>(null);
  const generation = useRef(0);
  const lock = useRef(false);
  const requestSeq = useRef(0);
  const recorded = useRef(false);

  useEffect(() => {
    const worker = new Worker(new URL('../game/banqi/worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    return () => {
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!announce) return;
    const ids = [window.setTimeout(() => setDrawStep('result'), 700), window.setTimeout(() => setDrawStep(null), 1600)];
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, [announce]);

  useEffect(() => {
    lock.current = false;
  }, [moves, status]);

  useEffect(() => {
    if (status !== 'playing') return;
    writeSave({ mode: 'banqi', difficulty, humanFirst, layout, moves, undoUsed });
  }, [status, difficulty, humanFirst, layout, moves, undoUsed]);

  const settle = useCallback(
    (result: Exclude<Status, 'playing'>) => {
      if (recorded.current) return;
      recorded.current = true;
      setStatus(result);
      onFinish(result, difficulty);
    },
    [difficulty, onFinish],
  );

  const publish = useCallback(
    (nextMoves: BanqiMove[]) => {
      const position = replayBanqi(layout, nextMoves, humanFirst);
      if (!position) return;
      setSelected(null);
      setMoves(nextMoves);
      setBoard(position.board);
      setHumanSide(position.humanSide);
      const result = resultOf(position.board, position.humanSide, isHumanTurn(nextMoves.length, humanFirst), nextMoves.length);
      if (result !== 'playing') settle(result);
    },
    [humanFirst, layout, settle],
  );

  const askAi = useCallback(
    (snapshot: Uint8Array, side: Side | null, avoid: { from: number; to: number } | null, gen: number) => {
      const started = performance.now();
      const minDelay = THINK_MS[difficulty];
      const fallback = () => chooseBanqiAction(snapshot, difficulty, Math.random, side, avoid);
      const worker = workerRef.current;
      const deliver = (action: BanqiMove) => {
        const legal = isLegalAction(snapshot, side, action) ? action : fallback();
        const wait = Math.max(0, minDelay - (performance.now() - started));
        return new Promise<BanqiMove | null>((resolve) => {
          window.setTimeout(() => resolve(gen === generation.current ? legal : null), wait);
        });
      };
      if (!worker) return deliver(fallback());

      requestSeq.current += 1;
      const id = requestSeq.current;
      return new Promise<BanqiMove | null>((resolve) => {
        let timer = 0;
        const finishMove = (action: BanqiMove) => {
          window.clearTimeout(timer);
          worker.removeEventListener('message', onMessage);
          const legal = isLegalAction(snapshot, side, action) ? action : fallback();
          const wait = Math.max(0, minDelay - (performance.now() - started));
          window.setTimeout(() => resolve(gen === generation.current ? legal : null), wait);
        };
        const onMessage = (event: MessageEvent<BanqiAiResponse>) => {
          if (event.data.id !== id) return;
          finishMove(event.data.action);
        };
        timer = window.setTimeout(() => finishMove(fallback()), difficulty === 'hard' ? 1600 : 900);
        worker.addEventListener('message', onMessage);
        worker.postMessage({ id, board: snapshot, difficulty, aiSide: side, avoid });
      });
    },
    [difficulty],
  );

  useEffect(() => {
    if (status !== 'playing' || drawStep || isHumanTurn(moves.length, humanFirst)) return;
    const snapshot = board.slice();
    const played = moves;
    const side = humanSide === null ? null : opposite(humanSide);
    const previous = played[played.length - 1];
    const avoid = previous && previous.kind === 'move' ? { from: previous.from, to: previous.to } : null;
    const gen = generation.current;
    let ignore = false;
    void askAi(snapshot, side, avoid, gen).then((action) => {
      if (ignore || gen !== generation.current || !action || !isLegalAction(snapshot, side, action)) return;
      publish([...played, action]);
    });
    return () => {
      ignore = true;
      generation.current += 1;
    };
  }, [askAi, board, drawStep, humanFirst, humanSide, moves, publish, status]);

  const yourTurn = status === 'playing' && drawStep === null && isHumanTurn(moves.length, humanFirst);
  const aiTurn = status === 'playing' && drawStep === null && !yourTurn;
  const aiSide = humanSide === null ? null : opposite(humanSide);
  const counts = sideCounts(board);
  const marks =
    selected === null
      ? []
      : moveTargets(board, selected).map((target) => ({ index: target.to, kind: target.kind }));
  const lastMove = moves[moves.length - 1];
  const last = lastMove ? (lastMove.kind === 'flip' ? lastMove.index : lastMove.to) : null;
  let sawHuman = false;
  for (let i = 0; i < moves.length; i += 1) {
    if (isHumanTurn(i, humanFirst)) sawHuman = true;
  }
  const canUndo = yourTurn && !undoUsed && sawHuman;

  function onCell(index: number) {
    if (!yourTurn || lock.current) return;
    const cell = board[index];
    if (isHidden(cell)) {
      const action: BanqiMove = { kind: 'flip', index };
      if (!isLegalAction(board, humanSide, action)) return;
      lock.current = true;
      publish([...moves, action]);
      return;
    }
    if (selected !== null && marks.some((mark) => mark.index === index)) {
      const action: BanqiMove = { kind: 'move', from: selected, to: index };
      if (!isLegalAction(board, humanSide, action)) return;
      lock.current = true;
      publish([...moves, action]);
      return;
    }
    if (isRevealed(cell) && humanSide !== null && sideOf(cell) === humanSide) {
      setSelected((current) => (current === index ? null : index));
      return;
    }
    setSelected(null);
  }

  function undo() {
    if (!canUndo) return;
    const drop = isHumanTurn(moves.length - 1, humanFirst) ? 1 : 2;
    if (moves.length < drop) return;
    const kept = moves.slice(0, -drop);
    const position = replayBanqi(layout, kept, humanFirst);
    if (!position) return;
    generation.current += 1;
    setMoves(kept);
    setBoard(position.board);
    setHumanSide(position.humanSide);
    setSelected(null);
    setUndoUsed(true);
  }

  function surrender() {
    if (status !== 'playing' || drawStep) return;
    generation.current += 1;
    setSurrendered(true);
    settle('lose');
  }

  const text =
    status === 'win'
      ? '你把达达利亚的棋子都吃光了'
      : status === 'lose'
        ? surrendered
          ? '你投降了，达达利亚赢了'
          : '达达利亚赢了'
        : status === 'draw'
          ? counts.red === 0 && counts.black === 0
            ? '双方棋子都没了，这盘是和局'
            : `下了超过${DRAW_AFTER_MOVES}步，这盘是和局`
          : drawStep === 'draw'
            ? '正在抽取先后手…'
            : drawStep === 'result'
              ? humanFirst
                ? '你先手'
                : '达达利亚先手'
              : aiTurn
                ? '达达利亚正在想…'
                : humanSide === null
                  ? '翻开一枚棋，这枚棋的颜色就是你的'
                  : '轮到你：可以翻棋，或走自己已翻开的棋';

  return (
    <>
      <header className="top">
        <div>
          <h1>翻翻棋</h1>
          <p>
            {LEVEL_LABEL[difficulty]} · {hint} · 红棋 {counts.red} · 黑棋 {counts.black}
          </p>
        </div>
        <button type="button" className="ghost" onClick={onHome}>
          返回
        </button>
      </header>

      <main className="stage">
        <section className={yourTurn || status === 'win' ? 'seat active' : 'seat'}>
          <Portrait who="human" />
          <h2>旅行者</h2>
          <p>
            <span className={chipClass(humanSide)}>{chipText(humanSide)}</span>
            {sideText(humanSide, humanFirst)}
          </p>
        </section>

        <BanqiBoard
          board={board}
          interactive={yourTurn}
          selected={selected}
          marks={marks}
          last={last}
          label={`翻翻棋棋盘，${text}`}
          onCell={onCell}
        />

        <section className={aiTurn ? 'seat active thinking' : status === 'lose' ? 'seat active' : 'seat'}>
          <Portrait who="ai" />
          <h2>达达利亚</h2>
          <p>
            <span className={chipClass(aiSide)}>{chipText(aiSide)}</span>
            {sideText(aiSide, !humanFirst)}
          </p>
        </section>
      </main>

      <footer className="bar">
        <div>
          <p className={`status status-${status}`} aria-live="polite">
            {text}
          </p>
          <p className="rule-line">大子吃小子。兵能吃将，将不能吃兵。一样大互相吃掉，但炮吃炮只去掉对方。炮平时走一格，吃子时只能紧挨着隔一枚棋。超过{DRAW_AFTER_MOVES}步仍未分胜负，算和局。</p>
        </div>
        <div className="actions">
          <button type="button" className="ghost" onClick={undo} disabled={!canUndo}>
            {undoUsed ? '悔棋已用' : '悔棋'}
          </button>
          <button type="button" className="ghost danger" onClick={surrender} disabled={status !== 'playing' || drawStep !== null}>
            投降
          </button>
        </div>
      </footer>

      {drawStep && (
        <div className="veil" role="presentation">
          <div className="dialog draw-card" role="dialog" aria-modal="true" aria-labelledby="banqi-draw-title">
            <h2 id="banqi-draw-title">{drawStep === 'draw' ? '抽取先后手' : '先后手已定'}</h2>
            <p>{drawStep === 'draw' ? '正在抽取…' : humanFirst ? '你先手' : '达达利亚先手'}</p>
            {drawStep === 'result' && <p className="dialog-note">你翻开的第一枚棋决定你的颜色</p>}
          </div>
        </div>
      )}
    </>
  );
}
