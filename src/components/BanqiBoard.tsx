import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import type { BanqiMark } from '../render/banqiArt.ts';
import { banqiCellAt, renderBanqi } from '../render/banqiArt.ts';

type BanqiBoardProps = {
  board: Uint8Array;
  interactive: boolean;
  selected: number | null;
  marks: readonly BanqiMark[];
  last: number | null;
  label: string;
  onCell: (index: number) => void;
};

export function BanqiBoard({ board, interactive, selected, marks, last, label, onCell }: BanqiBoardProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverRef = useRef<number | null>(null);
  const placedAt = useRef(0);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width < 8 || size.height < 8) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pixelsW = Math.round(size.width * dpr);
    const pixelsH = Math.round(size.height * dpr);
    if (canvas.width !== pixelsW || canvas.height !== pixelsH) {
      canvas.width = pixelsW;
      canvas.height = pixelsH;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderBanqi(ctx, size.width, size.height, board, interactive ? hoverRef.current : null, selected, marks, last, placedAt.current);
  }, [board, interactive, last, marks, selected, size.height, size.width]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(() => {
      const width = Math.floor(wrap.clientWidth);
      const height = Math.floor(wrap.clientHeight);
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

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
  }, [board, last, size.width, size.height, paint]);

  useEffect(() => {
    if (!interactive) hoverRef.current = null;
    paint();
  }, [interactive, paint]);

  function cellFromEvent(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || size.width < 8) return null;
    const rect = canvas.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * size.width;
    const py = ((event.clientY - rect.top) / rect.height) * size.height;
    return banqiCellAt(px, py, size.width, size.height);
  }

  return (
    <div className="board-wrap banqi" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className={interactive ? 'board interactive' : 'board'}
        role="application"
        aria-label={label}
        onPointerMove={(event) => {
          if (!interactive) return;
          const cell = cellFromEvent(event);
          if (hoverRef.current === cell) return;
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
          if (cell === null) return;
          onCell(cell);
        }}
      />
    </div>
  );
}
