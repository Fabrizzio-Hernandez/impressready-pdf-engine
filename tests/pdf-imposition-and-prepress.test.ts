import { PDFDocument } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import {
  executeBatchProcessor,
  mergePdfsIntoSingleDocument,
} from '../src/lib/batch-processor';
import {
  createAutoRotatePdf,
  createBinderSpinePdf,
  createBookletPdf,
  createBrochureFoldPdf,
  createGutterMarginPdf,
  createNUpPdf,
  createPrintStampPdf,
  createReverseOrderPdf,
  createTemplatePdf,
  splitPdfByColor,
} from '../src/lib/pdf-engine';

async function createSamplePdf(
  pageCount: number,
  size: [number, number] = [595.28, 841.89] // A4 portrait
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage(size);
    page.drawText(`Page ${i + 1}`, { x: 40, y: size[1] - 60, size: 16 });
  }
  return await doc.save();
}

describe('vector PDF imposition, prepress templates & batch utilities', () => {
  it('createBookletPdf performs 4-page signature padding and saddle-stitch imposition onto landscape A4 sheets', async () => {
    // 5 pages pad to 8 pages -> 2 sheets x 2 sides = 4 output A4 landscape pages
    const input = await createSamplePdf(5);
    const outBytes = await createBookletPdf(input);
    const outDoc = await PDFDocument.load(outBytes);

    expect(outDoc.getPageCount()).toBe(4);
    const { width, height } = outDoc.getPage(0).getSize();
    expect(width).toBeGreaterThan(height); // Landscape A4
  });

  it('createNUpPdf builds 4-up grids and 3-up ruled speaker handouts', async () => {
    const input = await createSamplePdf(7);

    const grid4Bytes = await createNUpPdf(input, {
      pagesPerSheet: 4,
      orientation: 'landscape',
      drawBorders: true,
      drawCutGuides: true,
      removeMargins: false,
      mode: 'grid',
    });
    expect((await PDFDocument.load(grid4Bytes)).getPageCount()).toBe(2);

    const handoutBytes = await createNUpPdf(input, {
      pagesPerSheet: 3,
      orientation: 'portrait',
      drawBorders: true,
      drawCutGuides: false,
      removeMargins: false,
      mode: 'handout_3up',
      notesLinesCount: 5,
    });
    expect((await PDFDocument.load(handoutBytes)).getPageCount()).toBe(3);
  });

  it('createBrochureFoldPdf outputs front + inside landscape sheets for bifold and trifold brochures', async () => {
    const fourPanels = await createSamplePdf(4);
    const bifoldBytes = await createBrochureFoldPdf(fourPanels, {
      foldType: 'bifold',
      paperSize: 'a4_landscape',
      includeFoldMarks: true,
      includeFoldLines: true,
      marginMm: 6,
    });
    expect((await PDFDocument.load(bifoldBytes)).getPageCount()).toBe(2);

    const sixPanels = await createSamplePdf(6);
    const trifoldBytes = await createBrochureFoldPdf(sixPanels, {
      foldType: 'trifold_c',
      paperSize: 'a4_landscape',
      includeFoldMarks: true,
      includeFoldLines: false,
      marginMm: 5,
    });
    expect((await PDFDocument.load(trifoldBytes)).getPageCount()).toBe(2);
  });

  it('createTemplatePdf & createBinderSpinePdf generate pure vector prepress A4 documents', async () => {
    for (const type of ['graph', 'dotgrid', 'music', 'cornell', 'hexagonal'] as const) {
      const pdfBytes = await createTemplatePdf({
        type,
        gridSpacingMm: 5,
        dotSpacingMm: 5,
        stavesCount: 8,
      });
      const doc = await PDFDocument.load(pdfBytes);
      expect(doc.getPageCount()).toBe(1);
    }

    const spineBytes = await createBinderSpinePdf({
      preset: 'lever_wide_80',
      widthMm: 80,
      heightMm: 190,
      colorBand: '#1E3A8A',
      colorBandHeightMm: 22,
      category: 'FINANCE',
      title: 'FY 2026 Ledger',
      subtitle: 'EU Tax & VAT',
      volumeNumber: 'VOL. 1',
      hasThumbHole: true,
      thumbHoleDistMm: 45,
      includeLines: true,
      textOrientation: 'vertical',
      quantityPerPage: 2,
    });
    expect((await PDFDocument.load(spineBytes)).getPageCount()).toBe(1);
  });

  it('supports gutter margins, auto-rotation, reverse print order, watermarks, and color/BW splitting', async () => {
    const mixedInput = await createSamplePdf(4);

    const gutterOut = await createGutterMarginPdf(mixedInput, {
      marginMm: 15,
      position: 'left',
      duplexAlternating: true,
      punchHolesGuide: '4_holes',
      scaleToFit: true,
    });
    expect((await PDFDocument.load(gutterOut)).getPageCount()).toBe(4);

    const reversed = await createReverseOrderPdf(mixedInput, 'all');
    expect((await PDFDocument.load(reversed)).getPageCount()).toBe(4);

    const stamped = await createPrintStampPdf(mixedInput, {
      preset: 'confidential',
      customText: 'CONFIDENTIAL',
      style: 'outline',
      opacity: 0.25,
      color: '#dc2626',
      position: 'diagonal',
      fontSize: 42,
      pages: 'all',
    });
    expect((await PDFDocument.load(stamped)).getPageCount()).toBe(4);

    const rotatedLandscape = await createAutoRotatePdf(mixedInput, 'landscape');
    const rotDoc = await PDFDocument.load(rotatedLandscape);
    expect(rotDoc.getPage(0).getRotation().angle).toBe(90);

    const { colorPdfBytes, bwPdfBytes } = await splitPdfByColor(mixedInput, [1, 3], [2, 4]);
    expect(colorPdfBytes).not.toBeNull();
    expect(bwPdfBytes).not.toBeNull();
    expect((await PDFDocument.load(colorPdfBytes!)).getPageCount()).toBe(2);
    expect((await PDFDocument.load(bwPdfBytes!)).getPageCount()).toBe(2);
  });

  it('merges multi-document PDF buffers and tracks sequential batch execution progress', async () => {
    const docA = await createSamplePdf(2);
    const docB = await createSamplePdf(3);
    const merged = await mergePdfsIntoSingleDocument([docA, docB]);
    expect((await PDFDocument.load(merged)).getPageCount()).toBe(5);

    const fakeFiles = [
      { name: 'one.pdf' } as File,
      { name: 'two.pdf' } as File,
    ];
    const progressEvents: number[] = [];
    const onItemProgress = vi.fn();

    const results = await executeBatchProcessor(
      fakeFiles,
      async (file) => ({ name: `out-${file.name}`, data: docA }),
      {
        onItemProgress,
        onOverallProgress: (pct) => progressEvents.push(pct),
      }
    );

    expect(results).toHaveLength(2);
    expect(progressEvents).toEqual([50, 100]);
    expect(onItemProgress).toHaveBeenCalledTimes(4);
  });
});
