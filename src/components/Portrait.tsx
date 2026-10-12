import { useEffect, useRef, useState } from 'react';
import { drawPortrait, drawStoneIcon, portraitReady, portraitSource, subscribeAvatar } from '../render/artwork.ts';

type PortraitProps = {
  who: 'human' | 'ai';
};

export function Portrait({ who }: PortraitProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(() => portraitReady(who));

  useEffect(() => {
    setReady(portraitReady(who));
    return subscribeAvatar(() => setReady(portraitReady(who)));
  }, [who]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const logical = 192;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(logical * dpr);
    canvas.height = Math.round(logical * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    drawPortrait(ctx, logical, who, ready ? portraitSource(who) : null);
  }, [who, ready]);

  return (
    <canvas
      ref={canvasRef}
      className="portrait-canvas"
      width={192}
      height={192}
      aria-label={who === 'ai' ? '达达利亚' : '旅行者'}
    />
  );
}

type StoneIconProps = {
  color: 'black' | 'white';
};

export function StoneIcon({ color }: StoneIconProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const logical = 22;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(logical * dpr);
    canvas.height = Math.round(logical * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawStoneIcon(ctx, logical, color);
  }, [color]);

  return <canvas ref={canvasRef} className="stone-icon" width={22} height={22} aria-hidden="true" />;
}
