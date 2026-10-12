import { useCallback, useEffect, useRef, useState } from 'react';
import { BanqiGame } from './components/BanqiGame.tsx';
import { BoardView } from './components/BoardView.tsx';
import { Portrait, StoneIcon } from './components/Portrait.tsx';
import { chooseMove } from './game/ai.ts';
import { shuffledLayout } from './game/banqi/rules.ts';
import { isFull, winningLine } from './game/board.ts';
import {
  clearSave,
  humanHasMoved,
  loadHistory,
  loadSave,
  pushHistory,
  replayMoves,
  stoneAtMove,
  writeSave,
  type BanqiSave,
  type MatchRecord,
  type SaveGame,
} from './game/storage.ts';
import { BLACK, EMPTY, SIZE, WHITE, idx, type AiRequest, type AiResponse, type Difficulty, type GameMode, type Point, type Status, type Stone } from './game/types.ts';

const THINK_MS: Record<Difficulty, number> = {
  easy: 320,
  normal: 420,
  hard: 200,
};

const HINT: Record<Difficulty, string> = {
  easy: '会漏掉一些要害，适合先熟悉棋盘',
  normal: '该赢会赢，该挡会挡',
  hard: '会往后多看几步',
};

const BANQI_HINT: Record<Difficulty, string> = {
  easy: '经常乱翻乱走，吃子也不稳',
  normal: '会吃能吃的子，也会躲开要被吃的子',
  hard: '会看你下一手怎么应',
};

function modeName(mode: GameMode) {
  return mode === 'banqi' ? '翻翻棋' : '五子棋';
}

const LEVELS: readonly { id: Difficulty; label: string }[] = [
  { id: 'easy', label: '简单' },
  { id: 'normal', label: '普通' },
  { id: 'hard', label: '困难' },
];

const RESULT_LABEL: Record<Exclude<Status, 'playing'>, string> = {
  win: '你赢了',
  lose: '达达利亚赢了',
  draw: '平局',
};

type Screen = 'home' | 'pick' | 'game';
type DrawStep = 'draw' | 'result' | null;

function levelLabel(level: Difficulty) {
  return LEVELS.find((item) => item.id === level)?.label ?? level;
}

function formatWhen(at: number) {
  const date = new Date(at);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function opponentStone(stone: Stone): Stone {
  return stone === BLACK ? WHITE : BLACK;
}

function rollSide(): Stone {
  return Math.random() < 0.5 ? BLACK : WHITE;
}

function rollBanqiOpening() {
  return {
    humanFirst: Math.random() < 0.5,
    layout: shuffledLayout(Math.random),
  };
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [mode, setMode] = useState<GameMode>('gomoku');
  const [banqiLaunch, setBanqiLaunch] = useState<BanqiSave | null>(null);
  const [announceBanqi, setAnnounceBanqi] = useState(false);
  const [banqiNonce, setBanqiNonce] = useState(0);
  const [saveSlot, setSaveSlot] = useState<SaveGame | null>(() => loadSave());
  const [records, setRecords] = useState<MatchRecord[]>(() => loadHistory());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [humanStone, setHumanStone] = useState<Stone>(BLACK);
  const [board, setBoard] = useState(() => new Uint8Array(SIZE * SIZE));
  const [history, setHistory] = useState<Point[]>([]);
  const [lastMove, setLastMove] = useState<Point | null>(null);
  const [winLine, setWinLine] = useState<Point[] | null>(null);
  const [status, setStatus] = useState<Status>('playing');
  const [undoUsed, setUndoUsed] = useState(false);
  const [surrendered, setSurrendered] = useState(false);
  const [drawStep, setDrawStep] = useState<DrawStep>(null);

  const workerRef = useRef<Worker | null>(null);
  const generation = useRef(0);
  const lock = useRef(false);
  const requestSeq = useRef(0);
  const recorded = useRef(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const worker = new Worker(new URL('./game/ai.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    return () => {
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
      timers.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  useEffect(() => {
    lock.current = false;
  }, [history, status, screen]);

  useEffect(() => {
    if (mode !== 'gomoku' || screen !== 'game' || status !== 'playing') return;
    writeSave({
      mode: 'gomoku',
      difficulty,
      humanStone,
      moves: history,
      undoUsed,
    });
  }, [mode, screen, status, difficulty, humanStone, history, undoUsed]);

  function clearDrawTimers() {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  }

  const finish = useCallback((result: Exclude<Status, 'playing'>, line: Point[] | null) => {
    setWinLine(line);
    setStatus(result);
    clearSave();
    setSaveSlot(null);
    if (recorded.current) return;
    recorded.current = true;
    setRecords(pushHistory({ mode: 'gomoku', difficulty, result, at: Date.now() }));
  }, [difficulty]);

  const askAi = useCallback((snapshot: Uint8Array, level: Difficulty, ai: Stone, gen: number) => {
    const started = performance.now();
    const minDelay = THINK_MS[level];
    const deliver = (move: Point) =>
      new Promise<Point | null>((resolve) => {
        const wait = Math.max(0, minDelay - (performance.now() - started));
        window.setTimeout(() => resolve(gen === generation.current ? move : null), wait);
      });

    const worker = workerRef.current;
    if (!worker) return deliver(chooseMove(snapshot, level, Math.random, ai));

    requestSeq.current += 1;
    const id = requestSeq.current;
    const payload: AiRequest = { id, board: snapshot, difficulty: level, ai };

    return new Promise<Point | null>((resolve) => {
      let timer = 0;
      const finishMove = (move: Point) => {
        window.clearTimeout(timer);
        worker.removeEventListener('message', onMessage);
        const wait = Math.max(0, minDelay - (performance.now() - started));
        window.setTimeout(() => resolve(gen === generation.current ? move : null), wait);
      };
      const onMessage = (event: MessageEvent<AiResponse>) => {
        if (event.data.id !== id) return;
        finishMove({ x: event.data.x, y: event.data.y });
      };
      timer = window.setTimeout(() => finishMove(chooseMove(snapshot, level, Math.random, ai)), level === 'hard' ? 1800 : 1000);
      worker.addEventListener('message', onMessage);
      worker.postMessage(payload);
    });
  }, []);

  useEffect(() => {
    if (screen !== 'game' || drawStep || status !== 'playing') return;
    const ai = opponentStone(humanStone);
    if (stoneAtMove(history.length) !== ai) return;
    const snapshot = replayMoves(history);
    if (!snapshot) return;
    const gen = generation.current;
    const moves = history;
    let ignore = false;
    void askAi(snapshot, difficulty, ai, gen).then((move) => {
      if (ignore || gen !== generation.current || !move || snapshot[idx(move.x, move.y)] !== EMPTY) return;
      const after = snapshot.slice();
      after[idx(move.x, move.y)] = ai;
      const nextMoves = [...moves, move];
      const line = winningLine(after, move.x, move.y);
      setBoard(after);
      setHistory(nextMoves);
      setLastMove(move);
      if (line) finish('lose', line);
      else if (isFull(after)) finish('draw', null);
    });
    return () => {
      ignore = true;
      generation.current += 1;
    };
  }, [screen, drawStep, status, history, humanStone, difficulty, askAi, finish]);

  function onPlay(x: number, y: number) {
    if (lock.current || screen !== 'game' || status !== 'playing' || drawStep) return;
    if (stoneAtMove(history.length) !== humanStone) return;
    if (board[idx(x, y)] !== EMPTY) return;

    lock.current = true;
    const next = board.slice();
    next[idx(x, y)] = humanStone;
    const played = { x, y };
    const moves = [...history, played];
    const line = winningLine(next, x, y);
    setBoard(next);
    setHistory(moves);
    setLastMove(played);
    if (line) finish('win', line);
    else if (isFull(next)) finish('draw', null);
  }

  function undo() {
    if (undoUsed || drawStep || status !== 'playing' || screen !== 'game') return;
    if (stoneAtMove(history.length) === opponentStone(humanStone)) return;
    if (!humanHasMoved(history, humanStone)) return;
    const last = stoneAtMove(history.length - 1);
    const drop = last === humanStone ? 1 : 2;
    if (history.length < drop) return;
    const kept = history.slice(0, -drop);
    const next = replayMoves(kept);
    if (!next) return;
    generation.current += 1;
    setHistory(kept);
    setBoard(next);
    setLastMove(kept.length > 0 ? kept[kept.length - 1] : null);
    setWinLine(null);
    setUndoUsed(true);
  }

  function surrender() {
    if (status !== 'playing' || drawStep || screen !== 'game') return;
    generation.current += 1;
    setSurrendered(true);
    finish('lose', null);
  }

  function goHome() {
    clearDrawTimers();
    generation.current += 1;
    setDrawStep(null);
    setScreen('home');
    setHistoryOpen(false);
    setSaveSlot(loadSave());
  }

  const onBanqiFinish = useCallback((result: Exclude<Status, 'playing'>, level: Difficulty) => {
    clearSave();
    setSaveSlot(null);
    setRecords(pushHistory({ mode: 'banqi', difficulty: level, result, at: Date.now() }));
  }, []);

  function beginBanqi(level: Difficulty) {
    const save: BanqiSave = {
      mode: 'banqi',
      difficulty: level,
      ...rollBanqiOpening(),
      moves: [],
      undoUsed: false,
    };
    setDifficulty(level);
    setBanqiLaunch(save);
    setAnnounceBanqi(true);
    setBanqiNonce((value) => value + 1);
    setScreen('game');
    writeSave(save);
  }

  function begin(level: Difficulty) {
    if (mode === 'banqi') {
      beginBanqi(level);
      return;
    }
    const side = rollSide();
    recorded.current = false;
    generation.current += 1;
    clearDrawTimers();
    setSurrendered(false);
    setDifficulty(level);
    setHumanStone(side);
    setHistory([]);
    setBoard(new Uint8Array(SIZE * SIZE));
    setLastMove(null);
    setWinLine(null);
    setStatus('playing');
    setUndoUsed(false);
    setDrawStep('draw');
    setScreen('game');
    writeSave({ mode: 'gomoku', difficulty: level, humanStone: side, moves: [], undoUsed: false });
    timers.current = [
      window.setTimeout(() => setDrawStep('result'), 700),
      window.setTimeout(() => setDrawStep(null), 1600),
    ];
  }

  function continueGame() {
    const saved = loadSave();
    if (!saved) return;
    if (saved.mode === 'banqi') {
      setMode('banqi');
      setDifficulty(saved.difficulty);
      setBanqiLaunch(saved);
      setAnnounceBanqi(false);
      setBanqiNonce((value) => value + 1);
      setScreen('game');
      return;
    }
    setMode('gomoku');
    const restored = replayMoves(saved.moves);
    if (!restored) return;
    recorded.current = false;
    generation.current += 1;
    clearDrawTimers();
    setSurrendered(false);
    setDifficulty(saved.difficulty);
    setHumanStone(saved.humanStone);
    setHistory(saved.moves);
    setBoard(restored);
    setLastMove(saved.moves.length > 0 ? saved.moves[saved.moves.length - 1] : null);
    setWinLine(null);
    setStatus('playing');
    setUndoUsed(saved.undoUsed);
    setDrawStep(null);
    setScreen('game');
  }

  const aiStone = opponentStone(humanStone);
  const aiTurn = status === 'playing' && !drawStep && stoneAtMove(history.length) === aiStone;
  const yourTurn = status === 'playing' && !drawStep && stoneAtMove(history.length) === humanStone;
  const text =
    status === 'win'
      ? '你赢了'
      : status === 'lose'
        ? surrendered
          ? '你投降了，达达利亚赢了'
          : '达达利亚赢了'
        : status === 'draw'
          ? '这盘是平局'
          : drawStep === 'draw'
            ? '正在抽取先后手…'
            : drawStep === 'result'
              ? humanStone === BLACK
                ? '你执黑先手'
                : '达达利亚执黑先手'
              : stoneAtMove(history.length) === aiStone
                ? '达达利亚正在想…'
                : '轮到你落子';
  const canUndo = !undoUsed && !aiTurn && !drawStep && status === 'playing' && humanHasMoved(history, humanStone);

  return (
    <div className="page">
      {screen === 'home' && (
        <section className="home">
          <header className="top">
            <div>
              <h1>和达达利亚一起下棋</h1>
              <p>选一种棋局，和达达利亚对弈</p>
            </div>
            <button type="button" className="ghost" onClick={() => setHistoryOpen(true)}>
              历史记录
            </button>
          </header>

          <p className="notice">
            没下完的对局会自动存档。如果已经有存档又新开一局，这局还没下完就离开，新存档会覆盖上一局。一局结束后，存档会清除。
          </p>

          {saveSlot && (
            <div className="save-card">
              <div>
                <strong>有一局还没下完</strong>
                <p>
                  {modeName(saveSlot.mode)} · {levelLabel(saveSlot.difficulty)} · 已下 {saveSlot.moves.length} 手
                </p>
              </div>
              <button type="button" className="primary" onClick={continueGame}>
                继续这局
              </button>
            </div>
          )}

          <h2 className="section-title">模式</h2>
          <div className="modes">
            <button
              type="button"
              className="mode"
              onClick={() => {
                setMode('gomoku');
                setScreen('pick');
              }}
            >
              <span>五子棋</span>
              <small>横竖斜连成五子即胜</small>
            </button>
            <button
              type="button"
              className="mode"
              onClick={() => {
                setMode('banqi');
                setScreen('pick');
              }}
            >
              <span>翻翻棋</span>
              <small>4 列 8 行，翻开或走子，吃光对方即胜</small>
            </button>
          </div>
        </section>
      )}

      {screen === 'pick' && (
        <section className="home">
          <header className="top">
            <div>
              <h1>{modeName(mode)}</h1>
              <p>
                {mode === 'banqi'
                  ? '先选难度。开局抽取先后手，你翻开的第一枚棋决定你的颜色'
                  : '先选难度，开局后再抽取先后手'}
              </p>
            </div>
            <button type="button" className="ghost" onClick={() => setScreen('home')}>
              返回
            </button>
          </header>
          {saveSlot && <p className="notice">现在开始的话，如果这局没下完就离开，会覆盖上一局存档。</p>}
          <div className="levels pick-levels" role="group" aria-label="难度">
            {LEVELS.map((level) => (
              <button key={level.id} type="button" className="level" onClick={() => begin(level.id)}>
                <strong>{level.label}</strong>
                <small>{(mode === 'banqi' ? BANQI_HINT : HINT)[level.id]}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      {screen === 'game' && mode === 'banqi' && banqiLaunch && (
        <BanqiGame
          key={banqiNonce}
          launch={banqiLaunch}
          announce={announceBanqi}
          onHome={goHome}
          onFinish={onBanqiFinish}
          hint={BANQI_HINT[banqiLaunch.difficulty]}
        />
      )}

      {screen === 'game' && mode === 'gomoku' && (
        <>
          <header className="top">
            <div>
              <h1>五子棋</h1>
              <p>
                {levelLabel(difficulty)} · {HINT[difficulty]}
              </p>
            </div>
            <button type="button" className="ghost" onClick={goHome}>
              返回
            </button>
          </header>

          <main className="stage">
            <section className={yourTurn ? 'seat active' : 'seat'}>
              <Portrait who="human" />
              <h2>旅行者</h2>
              <p>
                <StoneIcon color={humanStone === BLACK ? 'black' : 'white'} />
                {humanStone === BLACK ? '黑棋 · 先手' : '白棋 · 后手'}
              </p>
            </section>

            <BoardView
              board={board}
              lastMove={lastMove}
              winLine={winLine}
              interactive={yourTurn}
              previewColor={humanStone === BLACK ? 'black' : 'white'}
              label={`五子棋棋盘，${text}`}
              onPlay={onPlay}
            />

            <section className={aiTurn ? 'seat active thinking' : status === 'lose' ? 'seat active' : 'seat'}>
              <Portrait who="ai" />
              <h2>达达利亚</h2>
              <p>
                <StoneIcon color={aiStone === BLACK ? 'black' : 'white'} />
                {aiStone === BLACK ? '黑棋 · 先手' : '白棋 · 后手'}
              </p>
            </section>
          </main>

          <footer className="bar">
            <p className={`status status-${status}`} aria-live="polite">
              {text}
            </p>
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
              <div className="dialog draw-card" role="dialog" aria-modal="true" aria-labelledby="draw-title">
                <h2 id="draw-title">{drawStep === 'draw' ? '抽取先后手' : '先后手已定'}</h2>
                <p>{drawStep === 'draw' ? '正在抽取…' : humanStone === BLACK ? '你执黑，先手' : '达达利亚执黑，先手'}</p>
              </div>
            </div>
          )}
        </>
      )}

      {historyOpen && (
        <div className="veil" role="presentation" onClick={() => setHistoryOpen(false)}>
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="history-title">历史记录</h2>
            <p className="dialog-note">各模式、各难度最近 10 局的结果</p>
            {records.length === 0 ? (
              <p className="empty">还没有下完的对局</p>
            ) : (
              <ol className="records">
                {records.map((record) => (
                  <li key={`${record.at}-${record.difficulty}-${record.result}`}>
                    <span>
                      {modeName(record.mode)} · {levelLabel(record.difficulty)}
                    </span>
                    <strong className={`result-${record.result}`}>
                      {record.mode === 'banqi' && record.result === 'draw' ? '和局' : RESULT_LABEL[record.result]}
                    </strong>
                    <time>{formatWhen(record.at)}</time>
                  </li>
                ))}
              </ol>
            )}
            <button type="button" className="primary" onClick={() => setHistoryOpen(false)}>
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
