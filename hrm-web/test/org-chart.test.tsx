import { describe, expect, it } from 'vitest';
import { fitView, zoomAt } from '@/features/org/pan-zoom';

describe('pan/zoom math', () => {
  it('zoomAt keeps the anchor point fixed', () => {
    expect(zoomAt({ x: 0, y: 0, scale: 1 }, 100, 50, 2)).toEqual({ x: -100, y: -50, scale: 2 });
  });

  it('zoomAt clamps scale', () => {
    expect(zoomAt({ x: 0, y: 0, scale: 1.8 }, 0, 0, 2).scale).toBe(2);
    expect(zoomAt({ x: 0, y: 0, scale: 1 }, 0, 0, 0.01).scale).toBe(0.3);
  });

  it('fitView centres small content without upscaling', () => {
    expect(fitView({ w: 200, h: 100 }, { w: 1000, h: 500 })).toEqual({ x: 400, y: 200, scale: 1 });
  });

  it('fitView shrinks very wide content', () => {
    expect(fitView({ w: 6000, h: 400 }, { w: 1200, h: 600 }).scale).toBe(0.3);
  });
});
