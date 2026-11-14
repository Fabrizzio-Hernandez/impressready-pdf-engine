import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanDocumentScan } from '../src/lib/adaptive-threshold';
import { processPureBlackCanvas } from '../src/lib/canvas-utils';
import { processInkSaver } from '../src/lib/color-algorithms';
import {
  createMockCanvas,
  getPixelRgba,
  installMockDocumentCanvas,
} from './helpers/mock-canvas';

describe('client-side Canvas 2D ink-saving & adaptive scan cleaning', () => {
  let restoreDocument: () => void;

  beforeEach(() => {
    restoreDocument = installMockDocumentCanvas();
  });

  afterEach(() => {
    restoreDocument();
  });

  it('processInkSaver flattens dark slide backgrounds to white while preserving saturated color graphics', () => {
    // 10x1 synthetic slide row:
    // - x = 0..7: dark-mode slide background (low saturation, very low luminance)
    // - x = 8: vibrant red chart bar (high saturation)
    // - x = 9: crisp white title pixel on dark slide
    const src = createMockCanvas(10, 1, (x) => {
      if (x < 8) return [24, 26, 32, 255];
      if (x === 8) return [220, 20, 40, 255];
      return [245, 245, 248, 255];
    });

    const result = processInkSaver(src, {
      mode: 'balanced',
      darkThreshold: 35,
      lightThreshold: 80,
      preserveColorSaturation: 40,
      flattenBackgroundToWhite: true,
    });

    expect(result.estimatedInkSavedPercent).toBeGreaterThan(50);

    // Dark low-saturation background converted to zero-ink white
    const [bgR, bgG, bgB] = getPixelRgba(result.canvas, 0, 0);
    expect([bgR, bgG, bgB]).toEqual([255, 255, 255]);

    // Saturated chart red kept strongly dominant over G/B channels
    const [chartR, chartG, chartB] = getPixelRgba(result.canvas, 8, 0);
    expect(chartR).toBeGreaterThan(150);
    expect(chartR).toBeGreaterThan(chartG + 80);
    expect(chartR).toBeGreaterThan(chartB + 80);
  });

  it('cleanDocumentScan applies local integral adaptive thresholding to lift shaded scans in crisp_bw mode', () => {
    // 16x16 shaded document with crisp dark ink stroke in center and darker shadow band on right half
    const src = createMockCanvas(16, 16, (x, y) => {
      const isInkStroke = x >= 6 && x <= 9 && y >= 5 && y <= 10;
      if (isInkStroke) return [35, 35, 35, 255];
      const paperShade = x < 8 ? 225 : 145; // uneven lighting across sheet
      return [paperShade, paperShade, paperShade, 255];
    });

    const cleaned = cleanDocumentScan(src, {
      mode: 'crisp_bw',
      brightness: 0,
      contrast: 50,
      rotation: 0,
      adaptiveRadius: 4,
    });

    // Paper areas on both light and shaded sides should lift to pure white
    expect(getPixelRgba(cleaned, 1, 1).slice(0, 3)).toEqual([255, 255, 255]);
    expect(getPixelRgba(cleaned, 14, 1).slice(0, 3)).toEqual([255, 255, 255]);

    // Ink center stays deep black
    expect(getPixelRgba(cleaned, 7, 7)[0]).toBeLessThan(60);
  });

  it('processPureBlackCanvas binarizes pixels cleanly around threshold in pure_mono mode', () => {
    const src = createMockCanvas(4, 1, (x) => {
      if (x < 2) return [60, 60, 60, 255];
      return [220, 220, 220, 255];
    });

    const mono = processPureBlackCanvas(src, 'pure_mono', 20, 160);
    expect(getPixelRgba(mono, 0, 0).slice(0, 3)).toEqual([0, 0, 0]);
    expect(getPixelRgba(mono, 3, 0).slice(0, 3)).toEqual([255, 255, 255]);
  });
});
