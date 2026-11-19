'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

export type View = { x: number; y: number; scale: number };
export const MIN_SCALE = 0.3;
export const MAX_SCALE = 2;
const STEP = 1.2;

const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

/** Zoom by `factor` around viewport point (px, py), which stays fixed on screen. */
export const zoomAt = (view: View, px: number, py: number, factor: number): View => {
  const scale = clampScale(view.scale * factor);
  const k = scale / view.scale;
  return { x: px - (px - view.x) * k, y: py - (py - view.y) * k, scale };
};

/** Scale content to fit the viewport (never above 1×) and centre it. */
export const fitView = (content: { w: number; h: number }, viewport: { w: number; h: number }, padding = 24): View => {
  const fit = Math.min(1, (viewport.w - 2 * padding) / content.w, (viewport.h - 2 * padding) / content.h);
  const scale = clampScale(fit);
  return { x: (viewport.w - content.w * scale) / 2, y: (viewport.h - content.h * scale) / 2, scale };
};

/** Pointer events that start on a control (box buttons, links) click instead of panning. */
const isControl = (target: EventTarget | null) => target instanceof Element && target.closest('button,a') !== null;

/**
 * View-only pan and zoom for a large chart: drag to pan, wheel or pinch to zoom, plus buttons.
 * The content element is moved with `translate(x, y) scale(s)` and `transform-origin: 0 0`.
 */
export function usePanZoom(): {
  view: View;
  viewportRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  zoomIn(): void;
  zoomOut(): void;
  fit(): void;
} {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });

  const centre = () => {
    const el = viewportRef.current;
    return { x: (el?.clientWidth ?? 0) / 2, y: (el?.clientHeight ?? 0) / 2 };
  };
  const zoomIn = useCallback(() => setView((v) => zoomAt(v, centre().x, centre().y, STEP)), []);
  const zoomOut = useCallback(() => setView((v) => zoomAt(v, centre().x, centre().y, 1 / STEP)), []);
  const fit = useCallback(() => {
    const vp = viewportRef.current;
    const content = contentRef.current;
    // offsetWidth/Height ignore CSS transforms, so this is the unscaled size.
    if (!vp || !content || !content.offsetWidth || !vp.clientWidth) return;
    setView(fitView({ w: content.offsetWidth, h: content.offsetHeight }, { w: vp.clientWidth, h: vp.clientHeight }));
  }, []);

  useLayoutEffect(() => {
    fit();
  }, [fit]);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const pointers = new Map<number, { x: number; y: number }>();
    const local = (e: PointerEvent | WheelEvent) => {
      const r = vp.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const pinch = () => {
      const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
      return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dist: Math.hypot(a.x - b.x, a.y - b.y) };
    };

    const onDown = (e: PointerEvent) => {
      if (isControl(e.target) || pointers.size >= 2) return;
      vp.setPointerCapture?.(e.pointerId);
      pointers.set(e.pointerId, local(e));
    };
    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      if (pointers.size === 1) {
        const p = local(e);
        pointers.set(e.pointerId, p);
        setView((v) => ({ ...v, x: v.x + p.x - prev.x, y: v.y + p.y - prev.y }));
        return;
      }
      const before = pinch();
      pointers.set(e.pointerId, local(e));
      const after = pinch();
      if (!before.dist) return;
      setView((v) => {
        const z = zoomAt(v, after.mid.x, after.mid.y, after.dist / before.dist);
        return { ...z, x: z.x + after.mid.x - before.mid.x, y: z.y + after.mid.y - before.mid.y };
      });
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      setView((v) => zoomAt(v, p.x, p.y, Math.exp(-e.deltaY * 0.001)));
    };

    vp.addEventListener('pointerdown', onDown);
    vp.addEventListener('pointermove', onMove);
    vp.addEventListener('pointerup', onUp);
    vp.addEventListener('pointercancel', onUp);
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      vp.removeEventListener('pointerdown', onDown);
      vp.removeEventListener('pointermove', onMove);
      vp.removeEventListener('pointerup', onUp);
      vp.removeEventListener('pointercancel', onUp);
      vp.removeEventListener('wheel', onWheel);
    };
  }, []);

  return { view, viewportRef, contentRef, zoomIn, zoomOut, fit };
}
