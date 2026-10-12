import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import type { Point } from '../game/types.ts';
import { pointToCell, renderBoard } from '../render/artwork.ts';

type BoardViewProps = {
  board: Uint8Array;
  lastMove: Point | null;
  winLine: Point[] | null;
  interactive: boolean;
  previewColor: 'black' | 'white';
  label: string;
  onPlay: (x: number, y: number) => void;
};

export function BoardView({ board, lastMove, winLine, interactive, previewColor, label, onPlay }: BoardViewProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverRef = useRef<Point | null>(null);
  const placedAt = useRef(0);
  const [logical, setLogical] = useState(0);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || logical < 8) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pixels = Math.round(logical * dpr);
    if (canvas.width !== pixels || canvas.height !== pixels) {
      canvas.width = pixels;
      canvas.height = pixels;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderBoard(
      ctx,
      logical,
      dpr,
      board,
      interactive ? hoverRef.current : null,
      lastMove,
      winLine,
      placedAt.current,
      previewColor,
    );
  }, [board, interactive, lastMove, logical, previewColor, winLine]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(() => {
      const next = Math.floor(wrap.clientWidth);
      setLogical((prev) => (prev === next ? prev : next));
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  const lastKey = lastMove ? `${lastMove.x},${lastMove.y}` : '';

  useEffect(() => {
    placedAt.current = performance.now();
    let frame = 0;
    const started = performance.now();
    const tick = () => {
      paint();
      if (performance.now() - started < 190) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [board, lastKey, winLine, logical, paint]);

  useEffect(() => {
    if (!interactive) hoverRef.current = null;
    paint();
  }, [interactive, paint]);

  function cellFromEvent(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || logical < 8) return null;
    const rect = canvas.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * logical;
    const py = ((event.clientY - rect.top) / rect.height) * logical;
    return pointToCell(px, py, logical);
  }

  return (
    <div className="board-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className={interactive ? 'board interactive' : 'board'}
        role="application"
        aria-label={label}
        onPointerMove={(event) => {
          if (!interactive) return;
          const cell = cellFromEvent(event);
          if (hoverRef.current?.x === cell?.x && hoverRef.current?.y === cell?.y) return;
          hoverRef.current = cell;
          paint();
        }}
        onPointerLeave={() => {
          hoverRef.current = null;
          paint();
        }}
        onPointerDown={(event) => {
          if (!interactive || event.button !== 0) return;
          const cell = cellFromEvent(event);
          if (!cell) return;
          onPlay(cell.x, cell.y);
        }}
      />
    </div>
  );
}
