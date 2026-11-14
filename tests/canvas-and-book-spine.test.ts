import { describe, expect, it } from 'vitest';
import { calculateBookSpineDimensions, PAPER_PRESETS } from '../src/lib/book-spine';
import {
  calculateSafeDisplayScale,
  mmToPt,
  mmToPx,
} from '../src/lib/canvas-utils';

describe('prepress unit geometry & book spine calculator', () => {
  it('converts ISO millimeters accurately to PDF PostScript points (72 DPI) and print pixels', () => {
    // A4 = 210mm x 297mm -> ~595.28 x 841.89 pt
    expect(mmToPt(210)).toBeCloseTo(595.276, 2);
    expect(mmToPt(297)).toBeCloseTo(841.89, 2);

    // 25.4 mm = 1 inch = 300 px at 300 DPI
    expect(mmToPx(25.4, 300)).toBe(300);
    expect(mmToPx(25.4, 600)).toBe(600);
  });

  it('caps high-resolution preview canvas scales within safe browser pixel-area limits', () => {
    const scaleSmall = calculateSafeDisplayScale(595, 842);
    expect(scaleSmall).toBe(1.0);

    // Oversized raster render (e.g. 5000 x 5000 px against 2048x2048 default cap) must downscale safely
    const maxPixels = 2048 * 2048;
    const safeHuge = calculateSafeDisplayScale(5000, 5000, maxPixels);
    expect(safeHuge).toBeLessThan(1);
    expect(Math.floor(5000 * safeHuge) * Math.floor(5000 * safeHuge)).toBeLessThanOrEqual(maxPixels);
  });

  it('computes softcover (PUR) and hardcover wrap cover widths cleanly across paper calipers', () => {
    expect(PAPER_PRESETS.length).toBeGreaterThanOrEqual(8);

    const softcover = calculateBookSpineDimensions({
      pageCount: 201, // Odd page count rounds up to 101 sheets
      paperPresetId: 'offset_80', // 0.100 mm per sheet
      bindingType: 'softcover',
      bookWidthMm: 148, // A5
      bookHeightMm: 210,
      bleedMm: 3,
    });

    expect(softcover.sheetsCount).toBe(101);
    expect(softcover.coreSpineMm).toBeCloseTo(10.1, 2);
    expect(softcover.spineThicknessMm).toBeCloseTo(10.7, 2); // + 0.6mm PUR glue
    expect(softcover.hingeMm).toBe(0);
    expect(softcover.totalCoverWidthMm).toBeCloseTo(3 + 148 + 10.7 + 148 + 3, 2);
    expect(softcover.totalCoverHeightMm).toBe(216);

    const hardcover = calculateBookSpineDimensions({
      pageCount: 200, // 100 sheets
      paperPresetId: 'novel_90_20', // 0.180 mm bulky novel paper
      bindingType: 'hardcover',
      bookWidthMm: 148,
      bookHeightMm: 210,
      bleedMm: 3,
    });

    expect(hardcover.hingeMm).toBe(8);
    expect(hardcover.spineThicknessMm).toBeCloseTo(23.2, 2); // 18.0 + 1.2 + 4.0
    expect(hardcover.totalCoverWidthMm).toBeCloseTo(3 + 148 + 8 + 23.2 + 8 + 148 + 3, 2);
  });

  it('clamps ultra-thin booklets to minimum printable softcover (3mm) and hardcover (7mm) spines', () => {
    const thinSoft = calculateBookSpineDimensions({
      pageCount: 16,
      paperPresetId: 'offset_80',
      bindingType: 'softcover',
      bookWidthMm: 148,
      bookHeightMm: 210,
    });
    expect(thinSoft.spineThicknessMm).toBe(3);

    const thinHard = calculateBookSpineDimensions({
      pageCount: 16,
      paperPresetId: 'offset_80',
      bindingType: 'hardcover',
      bookWidthMm: 148,
      bookHeightMm: 210,
    });
    expect(thinHard.spineThicknessMm).toBe(7);
  });
});
