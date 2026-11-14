import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';
import { mmToPt, canvasToBlob } from './canvas-utils';
import { 
  TilingConfig, 
  NUpConfig, 
  TemplateConfig,
  GutterMarginConfig,
  SmartCropConfig,
  AutoRotateConfig,
  ReverseOrderConfig,
  PrintStampConfig,
  BinderSpineConfig,
  BrochureFoldConfig,
} from '../types';

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean.split('').map(c => c + c).join('');
  }
  const num = parseInt(clean, 16);
  if (isNaN(num)) return { r: 0.8, g: 0.1, b: 0.1 };
  return {
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255,
  };
}

/**
 * Embeds all pages from srcDoc into destDoc (pdf-lib's embedPdf embeds only page 0 when indices are omitted).
 */
async function embedAllPdfPages(destDoc: PDFDocument, srcDoc: PDFDocument) {
  const indices = srcDoc.getPageIndices();
  return indices.length > 0 ? destDoc.embedPdf(srcDoc, indices) : [];
}

/**
 * Creates a Booklet (Saddle Stitch) from a multi-page PDF.
 * Arranges 2 pages side-by-side on A4 Landscape sheets ready for folding and stapling.
 */
export async function createBookletPdf(sourcePdfBytes: Uint8Array): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(sourcePdfBytes);
  const totalSrcPages = srcDoc.getPageCount();

  // Saddle stitch requires a multiple of 4 pages
  const paddedTotal = Math.ceil(totalSrcPages / 4) * 4;
  const numSheets = paddedTotal / 4;

  const destDoc = await PDFDocument.create();
  
  // A4 Landscape dimensions in points: 297mm x 210mm
  const a4Width = mmToPt(297);
  const a4Height = mmToPt(210);
  const halfWidth = a4Width / 2;

  // Embed all source pages
  const embeddedPages = await embedAllPdfPages(destDoc, srcDoc);

  for (let s = 0; s < numSheets; s++) {
    // Sheet Front: Left = paddedTotal - 2*s, Right = 2*s + 1
    // (1-indexed pages translated to 0-indexed embeddedPages)
    const frontLeftIdx = paddedTotal - 2 * s - 1;
    const frontRightIdx = 2 * s;

    // Sheet Back: Left = 2*s + 2, Right = paddedTotal - 2*s - 1
    const backLeftIdx = 2 * s + 1;
    const backRightIdx = paddedTotal - 2 * s - 2;

    // 1. Draw Front Page
    const frontSheet = destDoc.addPage([a4Width, a4Height]);
    drawHalfPage(frontSheet, embeddedPages, frontLeftIdx, 0, halfWidth, a4Height);
    drawHalfPage(frontSheet, embeddedPages, frontRightIdx, halfWidth, halfWidth, a4Height);
    drawFoldGuide(frontSheet, halfWidth, a4Height, `Pliego ${s + 1} - Cara A (Anverso)`);

    // 2. Draw Back Page
    const backSheet = destDoc.addPage([a4Width, a4Height]);
    drawHalfPage(backSheet, embeddedPages, backLeftIdx, 0, halfWidth, a4Height);
    drawHalfPage(backSheet, embeddedPages, backRightIdx, halfWidth, halfWidth, a4Height);
    drawFoldGuide(backSheet, halfWidth, a4Height, `Pliego ${s + 1} - Cara B (Reverso)`);
  }

  return await destDoc.save();
}

function drawHalfPage(
  sheet: any,
  embeddedPages: any[],
  pageIdx: number,
  xOffset: number,
  slotWidth: number,
  slotHeight: number
) {
  if (pageIdx < 0 || pageIdx >= embeddedPages.length) {
    // Blank page (padding) - leave empty
    return;
  }
  const embedded = embeddedPages[pageIdx];
  const origW = embedded.width;
  const origH = embedded.height;

  // Add 4mm safety margin around half page
  const margin = mmToPt(4);
  const usableW = slotWidth - margin * 2;
  const usableH = slotHeight - margin * 2;

  const scale = Math.min(usableW / origW, usableH / origH);
  const renderW = origW * scale;
  const renderH = origH * scale;

  const posX = xOffset + margin + (usableW - renderW) / 2;
  const posY = margin + (usableH - renderH) / 2;

  sheet.drawPage(embedded, {
    x: posX,
    y: posY,
    width: renderW,
    height: renderH,
  });
}

function drawFoldGuide(sheet: any, centerX: number, height: number, label: string) {
  // Center dotted fold line
  const dashLength = 6;
  const gapLength = 6;
  for (let y = 10; y < height - 10; y += dashLength + gapLength) {
    sheet.drawLine({
      start: { x: centerX, y },
      end: { x: centerX, y: Math.min(y + dashLength, height - 10) },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    });
  }

  // Fold indicator label at bottom
  sheet.drawText(label, {
    x: centerX - 60,
    y: 6,
    size: 7,
    color: rgb(0.5, 0.5, 0.5),
  });
}

/**
 * Creates a Tiled Multi-Page A4 Poster PDF with overlap margins, registration marks, and labels.
 */
export async function createPosterPdf(
  imageCanvas: HTMLCanvasElement,
  config: TilingConfig
): Promise<Uint8Array> {
  const destDoc = await PDFDocument.create();

  const isPortrait = config.orientation === 'portrait';
  const a4Width = mmToPt(isPortrait ? 210 : 297);
  const a4Height = mmToPt(isPortrait ? 297 : 210);

  // Margins in points
  const printMargin = mmToPt(6); // unprintable edge margin of standard printers
  const usableW = a4Width - printMargin * 2;
  const usableH = a4Height - printMargin * 2;

  const overlapPt = mmToPt(config.overlapMm);

  // Total source canvas dimensions
  const imgW = imageCanvas.width;
  const imgH = imageCanvas.height;

  // Calculate slice dimensions in source pixels
  const tilePixelW = imgW / config.cols;
  const tilePixelH = imgH / config.rows;

  // Convert overlap from target page scale back to canvas pixel scale
  const scaleX = tilePixelW / usableW;
  const scaleY = tilePixelH / usableH;
  const overlapPixelX = overlapPt * scaleX;
  const overlapPixelY = overlapPt * scaleY;

  for (let r = 0; r < config.rows; r++) {
    for (let c = 0; c < config.cols; c++) {
      // Create slice canvas for this tile
      const sliceCanvas = document.createElement('canvas');
      const startX = Math.max(0, c * tilePixelW - (c > 0 ? overlapPixelX : 0));
      const startY = Math.max(0, r * tilePixelH - (r > 0 ? overlapPixelY : 0));
      const endX = Math.min(imgW, (c + 1) * tilePixelW);
      const endY = Math.min(imgH, (r + 1) * tilePixelH);

      const sliceW = endX - startX;
      const sliceH = endY - startY;

      sliceCanvas.width = sliceW;
      sliceCanvas.height = sliceH;
      const sCtx = sliceCanvas.getContext('2d');
      if (sCtx) {
        sCtx.drawImage(
          imageCanvas,
          startX, startY, sliceW, sliceH,
          0, 0, sliceW, sliceH
        );
      }

      // Convert slice to JPG
      const blob = await canvasToBlob(sliceCanvas, 'image/jpeg', 0.95);
      const arrayBuf = await blob.arrayBuffer();
      const embeddedJpg = await destDoc.embedJpg(new Uint8Array(arrayBuf));

      const page = destDoc.addPage([a4Width, a4Height]);

      // Calculate placement on A4
      const drawW = (sliceW / tilePixelW) * usableW;
      const drawH = (sliceH / tilePixelH) * usableH;
      const posX = printMargin;
      const posY = a4Height - printMargin - drawH;

      page.drawImage(embeddedJpg, {
        x: posX,
        y: posY,
        width: drawW,
        height: drawH,
      });

      // Draw overlap glue guide on right and bottom if applicable
      if (config.overlapMm > 0) {
        if (c > 0) {
          // Left overlap guide
          page.drawLine({
            start: { x: posX + overlapPt, y: posY },
            end: { x: posX + overlapPt, y: posY + drawH },
            thickness: 0.5,
            color: rgb(0.8, 0.4, 0.2),
          });
        }
        if (r > 0) {
          // Top overlap guide
          page.drawLine({
            start: { x: posX, y: posY + drawH - overlapPt },
            end: { x: posX + drawW, y: posY + drawH - overlapPt },
            thickness: 0.5,
            color: rgb(0.8, 0.4, 0.2),
          });
        }
      }

      // Draw corner registration marks (+)
      if (config.showCropMarks) {
        const markSize = 8;
        const corners = [
          { x: posX, y: posY },
          { x: posX + drawW, y: posY },
          { x: posX, y: posY + drawH },
          { x: posX + drawW, y: posY + drawH },
        ];
        corners.forEach((pt) => {
          page.drawLine({
            start: { x: pt.x - markSize, y: pt.y },
            end: { x: pt.x + markSize, y: pt.y },
            thickness: 0.5,
            color: rgb(0.3, 0.3, 0.3),
          });
          page.drawLine({
            start: { x: pt.x, y: pt.y - markSize },
            end: { x: pt.x, y: pt.y + markSize },
            thickness: 0.5,
            color: rgb(0.3, 0.3, 0.3),
          });
        });
      }

      // Discreet footer label
      if (config.showLabels) {
        const labelText = `Fila ${r + 1}/${config.rows}, Col ${c + 1}/${config.cols} — Hoja ${(r * config.cols) + c + 1} de ${config.rows * config.cols}`;
        page.drawText(labelText, {
          x: printMargin,
          y: printMargin / 2,
          size: 7,
          color: rgb(0.4, 0.4, 0.4),
        });
      }
    }
  }

  return await destDoc.save();
}

/**
 * Creates a 10x15 cm Passport Photo Sheet PDF with exact millimeter physical scaling.
 */
export async function createPassportPdf(
  canvas: HTMLCanvasElement,
  paperType: '10x15' | 'a4' = '10x15'
): Promise<Uint8Array> {
  const destDoc = await PDFDocument.create();
  
  // 10x15 cm: 150mm x 100mm (Landscape) | A4: 210mm x 297mm (Portrait)
  const isA4 = paperType === 'a4';
  const widthPt = mmToPt(isA4 ? 210 : 150);
  const heightPt = mmToPt(isA4 ? 297 : 100);
  const page = destDoc.addPage([widthPt, heightPt]);

  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.98);
  const buffer = await blob.arrayBuffer();
  const embeddedJpg = await destDoc.embedJpg(new Uint8Array(buffer));

  page.drawImage(embeddedJpg, {
    x: 0,
    y: 0,
    width: widthPt,
    height: heightPt,
  });

  return await destDoc.save();
}

/**
 * Creates N-Up PDF (2, 4, 6, 8 pages per A4 sheet) optimizing margins.
 */
export async function createNUpPdf(sourcePdfBytes: Uint8Array, config: NUpConfig): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(sourcePdfBytes);
  const destDoc = await PDFDocument.create();
  const totalPages = srcDoc.getPageCount();

  // Special university handout mode: 3 slides stacked vertically on left + handwriting notes lines on right
  if (config.mode === 'handout_3up' || config.pagesPerSheet === 3) {
    const a4Width = mmToPt(210);
    const a4Height = mmToPt(297);
    const margin = mmToPt(12);
    const contentW = a4Width - margin * 2;
    const contentH = a4Height - margin * 2;

    const rowH = contentH / 3;
    const slideBoxW = contentW * 0.54;
    const notesBoxW = contentW * 0.42;
    const notesBoxX = margin + contentW * 0.58;

    const embeddedPages = await embedAllPdfPages(destDoc, srcDoc);
    const fontBold = await destDoc.embedFont(StandardFonts.HelveticaBold);

    let currentPageIdx = 0;
    while (currentPageIdx < totalPages) {
      const page = destDoc.addPage([a4Width, a4Height]);

      for (let r = 0; r < 3; r++) {
        if (currentPageIdx >= totalPages) break;

        const embedded = embeddedPages[currentPageIdx];
        const origW = embedded.width;
        const origH = embedded.height;

        const cellY = a4Height - margin - (r + 1) * rowH;

        // Slide placement
        const pad = 6;
        const scale = Math.min((slideBoxW - pad * 2) / origW, (rowH - pad * 2) / origH);
        const drawW = origW * scale;
        const drawH = origH * scale;

        const posX = margin + (slideBoxW - drawW) / 2;
        const posY = cellY + (rowH - drawH) / 2;

        page.drawPage(embedded, {
          x: posX,
          y: posY,
          width: drawW,
          height: drawH,
        });

        if (config.drawBorders) {
          page.drawRectangle({
            x: posX,
            y: posY,
            width: drawW,
            height: drawH,
            borderColor: rgb(0.8, 0.8, 0.8),
            borderWidth: 0.5,
          });
        }

        // Ruled notes lines on the right
        page.drawText(`NOTAS / APUNTES (DIAP. ${currentPageIdx + 1})`, {
          x: notesBoxX,
          y: cellY + rowH - 18,
          size: 7,
          font: fontBold,
          color: rgb(0.5, 0.5, 0.6),
        });

        const linesCount = config.notesLinesCount || 4;
        const lineSpacing = (rowH - 32) / (linesCount + 0.5);
        for (let l = 1; l <= linesCount; l++) {
          const lineY = cellY + rowH - 22 - l * lineSpacing;
          page.drawLine({
            start: { x: notesBoxX, y: lineY },
            end: { x: notesBoxX + notesBoxW, y: lineY },
            color: rgb(0.78, 0.8, 0.84),
            thickness: 0.6,
          });
        }

        currentPageIdx++;
      }
    }

    return await destDoc.save();
  }

  const isPortrait = config.orientation === 'portrait';
  const a4Width = mmToPt(isPortrait ? 210 : 297);
  const a4Height = mmToPt(isPortrait ? 297 : 210);

  let gridCols = 1;
  let gridRows = 2;
  if (config.pagesPerSheet === 2) {
    gridCols = isPortrait ? 1 : 2;
    gridRows = isPortrait ? 2 : 1;
  } else if (config.pagesPerSheet === 4) {
    gridCols = 2;
    gridRows = 2;
  } else if (config.pagesPerSheet === 6) {
    gridCols = isPortrait ? 2 : 3;
    gridRows = isPortrait ? 3 : 2;
  } else if (config.pagesPerSheet === 8) {
    gridCols = isPortrait ? 2 : 4;
    gridRows = isPortrait ? 4 : 2;
  } else if (config.pagesPerSheet === 9) {
    gridCols = 3;
    gridRows = 3;
  }

  const margin = config.removeMargins ? mmToPt(3) : mmToPt(8);
  const cellW = (a4Width - margin * 2) / gridCols;
  const cellH = (a4Height - margin * 2) / gridRows;

  const embeddedPages = await embedAllPdfPages(destDoc, srcDoc);

  let currentPageIdx = 0;
  while (currentPageIdx < totalPages) {
    const page = destDoc.addPage([a4Width, a4Height]);

    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        if (currentPageIdx >= totalPages) break;

        const embedded = embeddedPages[currentPageIdx];
        const origW = embedded.width;
        const origH = embedded.height;

        const scale = Math.min((cellW - 6) / origW, (cellH - 6) / origH);
        const drawW = origW * scale;
        const drawH = origH * scale;

        const cellX = margin + c * cellW;
        const cellY = a4Height - margin - (r + 1) * cellH;

        const posX = cellX + (cellW - drawW) / 2;
        const posY = cellY + (cellH - drawH) / 2;

        page.drawPage(embedded, {
          x: posX,
          y: posY,
          width: drawW,
          height: drawH,
        });

        if (config.drawBorders) {
          page.drawRectangle({
            x: posX,
            y: posY,
            width: drawW,
            height: drawH,
            borderColor: rgb(0.8, 0.8, 0.8),
            borderWidth: 0.5,
          });
        }

        currentPageIdx++;
      }
    }
  }

  return await destDoc.save();
}

/**
 * Reassembles processed canvas pages (from InkSaver or ScanCleaner) into a downloadable PDF.
 */
export async function createPdfFromCanvasList(
  canvasList: HTMLCanvasElement[],
  pageSize: 'A4' | 'original' = 'A4'
): Promise<Uint8Array> {
  const destDoc = await PDFDocument.create();

  for (const canvas of canvasList) {
    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
    const buffer = await blob.arrayBuffer();
    const embeddedJpg = await destDoc.embedJpg(new Uint8Array(buffer));

    let pageW: number;
    let pageH: number;

    if (pageSize === 'A4') {
      const isLandscape = canvas.width > canvas.height;
      pageW = mmToPt(isLandscape ? 297 : 210);
      pageH = mmToPt(isLandscape ? 210 : 297);
    } else {
      pageW = (canvas.width * 72) / 150;
      pageH = (canvas.height * 72) / 150;
    }

    const page = destDoc.addPage([pageW, pageH]);
    page.drawImage(embeddedJpg, {
      x: 0,
      y: 0,
      width: pageW,
      height: pageH,
    });
  }

  return await destDoc.save();
}

/**
 * Generates high-precision parametric vector PDF templates (graph paper, dot grid, music staves).
 */
export async function createTemplatePdf(config: TemplateConfig): Promise<Uint8Array> {
  const destDoc = await PDFDocument.create();
  // Standard A4 Portrait: 210 x 297 mm
  const a4Width = mmToPt(210);
  const a4Height = mmToPt(297);
  const page = destDoc.addPage([a4Width, a4Height]);

  const marginPt = mmToPt(10);
  const usableW = a4Width - marginPt * 2;
  const usableH = a4Height - marginPt * 2;

  if (config.type === 'graph') {
    const stepMm = config.gridSpacingMm || 5;
    const stepPt = mmToPt(stepMm);
    const majorEvery = config.majorLineEvery || 5;

    // Convert hex color to rgb
    const hex = (config.gridColor || '#0ea5e9').replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;

    // Vertical lines
    let col = 0;
    for (let x = marginPt; x <= a4Width - marginPt + 0.1; x += stepPt) {
      const isMajor = col % majorEvery === 0;
      page.drawLine({
        start: { x, y: marginPt },
        end: { x, y: a4Height - marginPt },
        thickness: isMajor ? 0.8 : 0.3,
        color: isMajor ? rgb(r * 0.8, g * 0.8, b * 0.8) : rgb(r, g, b),
        opacity: isMajor ? 0.85 : 0.45,
      });
      col++;
    }

    // Horizontal lines
    let row = 0;
    for (let y = marginPt; y <= a4Height - marginPt + 0.1; y += stepPt) {
      const isMajor = row % majorEvery === 0;
      page.drawLine({
        start: { x: marginPt, y },
        end: { x: a4Width - marginPt, y },
        thickness: isMajor ? 0.8 : 0.3,
        color: isMajor ? rgb(r * 0.8, g * 0.8, b * 0.8) : rgb(r, g, b),
        opacity: isMajor ? 0.85 : 0.45,
      });
      row++;
    }
  } else if (config.type === 'dotgrid') {
    const stepPt = mmToPt(config.dotSpacingMm || 5);
    const dotRadius = mmToPt(0.4);

    for (let x = marginPt; x <= a4Width - marginPt + 0.1; x += stepPt) {
      for (let y = marginPt; y <= a4Height - marginPt + 0.1; y += stepPt) {
        page.drawCircle({
          x,
          y,
          size: dotRadius,
          color: rgb(0.4, 0.4, 0.45),
          opacity: 0.6,
        });
      }
    }
  } else if (config.type === 'music') {
    const staves = config.stavesCount || 10;
    const staffHeightPt = mmToPt(8);
    const lineSpacingPt = staffHeightPt / 4;
    const staveSpacing = (usableH - staves * staffHeightPt) / (staves + 1);

    for (let s = 0; s < staves; s++) {
      const staffTop = a4Height - marginPt - staveSpacing * (s + 1) - staffHeightPt * s;
      for (let line = 0; line < 5; line++) {
        const y = staffTop - line * lineSpacingPt;
        page.drawLine({
          start: { x: marginPt, y },
          end: { x: a4Width - marginPt, y },
          thickness: 0.6,
          color: rgb(0.15, 0.15, 0.15),
        });
      }
    }
  } else if (config.type === 'handwriting') {
    // Montessori / Seyes 3-line ruling
    const rowHeightPt = mmToPt(12);
    const numRows = Math.floor(usableH / rowHeightPt);
    for (let i = 0; i < numRows; i++) {
      const yBase = a4Height - marginPt - (i + 1) * rowHeightPt;
      // Baseline
      page.drawLine({
        start: { x: marginPt, y: yBase },
        end: { x: a4Width - marginPt, y: yBase },
        thickness: 0.8,
        color: rgb(0.1, 0.1, 0.1),
      });
      // Midline (dashed)
      const yMid = yBase + rowHeightPt * 0.4;
      page.drawLine({
        start: { x: marginPt, y: yMid },
        end: { x: a4Width - marginPt, y: yMid },
        thickness: 0.4,
        color: rgb(0.2, 0.4, 0.8),
        opacity: 0.5,
      });
      // Top line
      const yTop = yBase + rowHeightPt * 0.8;
      page.drawLine({
        start: { x: marginPt, y: yTop },
        end: { x: a4Width - marginPt, y: yTop },
        thickness: 0.5,
        color: rgb(0.4, 0.4, 0.4),
        opacity: 0.6,
      });
    }
  } else if (config.type === 'cornell') {
    // Cornell Notes: Header + Cue column (left) + Notes (right) + Summary (bottom)
    const headerH = mmToPt(20);
    const summaryH = mmToPt(45);
    const cueW = mmToPt(55);

    // Header box
    page.drawRectangle({
      x: marginPt,
      y: a4Height - marginPt - headerH,
      width: usableW,
      height: headerH,
      borderColor: rgb(0.2, 0.2, 0.2),
      borderWidth: 0.8,
      color: rgb(0.97, 0.98, 0.99),
    });
    page.drawText('MATERIA / SUBJECT: ___________________  FECHA / DATE: ___________  TEMA: ___________________', {
      x: marginPt + 10,
      y: a4Height - marginPt - headerH + 8,
      size: 7.5,
      color: rgb(0.2, 0.2, 0.2),
    });

    // Summary box at bottom
    page.drawRectangle({
      x: marginPt,
      y: marginPt,
      width: usableW,
      height: summaryH,
      borderColor: rgb(0.2, 0.2, 0.2),
      borderWidth: 0.8,
      color: rgb(0.98, 0.98, 0.99),
    });
    page.drawText('RESUMEN / SUMMARY', {
      x: marginPt + 8,
      y: marginPt + summaryH - 12,
      size: 8,
      color: rgb(0.3, 0.3, 0.3),
    });
    // Summary note lines
    for (let y = marginPt + 10; y < marginPt + summaryH - 16; y += 18) {
      page.drawLine({
        start: { x: marginPt + 8, y },
        end: { x: a4Width - marginPt - 8, y },
        thickness: 0.3,
        color: rgb(0.8, 0.8, 0.85),
      });
    }

    // Central body: Cue column + Notes area
    const bodyY = marginPt + summaryH;
    const bodyH = a4Height - marginPt - headerH - bodyY;

    // Outer border
    page.drawRectangle({
      x: marginPt,
      y: bodyY,
      width: usableW,
      height: bodyH,
      borderColor: rgb(0.2, 0.2, 0.2),
      borderWidth: 0.8,
    });

    // Vertical cue divider
    page.drawLine({
      start: { x: marginPt + cueW, y: bodyY },
      end: { x: marginPt + cueW, y: bodyY + bodyH },
      thickness: 1,
      color: rgb(0.2, 0.2, 0.2),
    });

    page.drawText('IDEAS CLAVE / PREGUNTAS', {
      x: marginPt + 6,
      y: bodyY + bodyH - 14,
      size: 7,
      color: rgb(0.35, 0.35, 0.35),
    });

    page.drawText('APUNTES / NOTAS PRINCIPALES', {
      x: marginPt + cueW + 8,
      y: bodyY + bodyH - 14,
      size: 7,
      color: rgb(0.35, 0.35, 0.35),
    });

    // Notes ruled lines
    const lineStepPt = mmToPt(7.5);
    for (let y = bodyY + lineStepPt; y < bodyY + bodyH - 20; y += lineStepPt) {
      page.drawLine({
        start: { x: marginPt + cueW, y },
        end: { x: a4Width - marginPt, y },
        thickness: 0.35,
        color: rgb(0.8, 0.82, 0.88),
      });
    }
  } else if (config.type === 'lined') {
    // Classic University Lined Paper with Left Margin Rule
    const redMarginX = marginPt + mmToPt(26);
    const lineStepPt = mmToPt(8);

    // Left vertical red margin
    page.drawLine({
      start: { x: redMarginX, y: marginPt },
      end: { x: redMarginX, y: a4Height - marginPt },
      thickness: 0.8,
      color: rgb(0.9, 0.25, 0.25),
      opacity: 0.75,
    });

    // Horizontal ruled lines
    for (let y = marginPt + lineStepPt; y <= a4Height - marginPt - 5; y += lineStepPt) {
      page.drawLine({
        start: { x: marginPt, y },
        end: { x: a4Width - marginPt, y },
        thickness: 0.4,
        color: rgb(0.55, 0.65, 0.8),
        opacity: 0.5,
      });
    }
  } else if (config.type === 'isometric') {
    // 3D Isometric Grid (30° and 150° lines + vertical lines)
    const spacingPt = mmToPt(8);
    const gridColor = rgb(0.4, 0.55, 0.75);
    const gridOpacity = 0.4;

    // Vertical lines
    for (let x = marginPt; x <= a4Width - marginPt; x += spacingPt) {
      page.drawLine({
        start: { x, y: marginPt },
        end: { x, y: a4Height - marginPt },
        thickness: 0.3,
        color: gridColor,
        opacity: gridOpacity,
      });
    }

    // 30 degree lines (slope = tan(30) ~ 0.577)
    const tan30 = Math.tan((30 * Math.PI) / 180);
    const diagSpacing = spacingPt / Math.cos((30 * Math.PI) / 180);
    for (let startY = -a4Width * tan30; startY <= a4Height; startY += diagSpacing) {
      page.drawLine({
        start: { x: marginPt, y: Math.max(marginPt, startY) },
        end: { x: a4Width - marginPt, y: Math.min(a4Height - marginPt, startY + usableW * tan30) },
        thickness: 0.3,
        color: gridColor,
        opacity: gridOpacity,
      });
    }

    // 150 degree lines (-30 degrees)
    for (let startY = marginPt; startY <= a4Height + a4Width * tan30; startY += diagSpacing) {
      page.drawLine({
        start: { x: marginPt, y: Math.min(a4Height - marginPt, startY) },
        end: { x: a4Width - marginPt, y: Math.max(marginPt, startY - usableW * tan30) },
        thickness: 0.3,
        color: gridColor,
        opacity: gridOpacity,
      });
    }
  } else if (config.type === 'hexagonal') {
    // Hexagonal Grid for Organic Chemistry & Gaming Maps
    const r = mmToPt(5.5);
    const h = r * Math.sqrt(3);
    const colStep = r * 1.5;
    const rowStep = h;

    const hexColor = rgb(0.4, 0.5, 0.65);
    for (let cx = marginPt + r; cx <= a4Width - marginPt; cx += colStep * 2) {
      for (let cy = marginPt + h; cy <= a4Height - marginPt; cy += rowStep) {
        // Draw hexagon vertices
        for (let a = 0; a < 6; a++) {
          const a1 = (a * 60 * Math.PI) / 180;
          const a2 = (((a + 1) % 6) * 60 * Math.PI) / 180;
          page.drawLine({
            start: { x: cx + r * Math.cos(a1), y: cy + r * Math.sin(a1) },
            end: { x: cx + r * Math.cos(a2), y: cy + r * Math.sin(a2) },
            thickness: 0.35,
            color: hexColor,
            opacity: 0.5,
          });
        }
      }
    }
  } else if (config.type === 'storyboard') {
    // Storyboard: 6 widescreen frames (2 cols x 3 rows) with action & audio lines
    const cols = 2;
    const rows = 3;
    const colW = (usableW - mmToPt(12)) / cols;
    const rowH = (usableH - mmToPt(14)) / rows;
    const frameH = colW * (9 / 16); // 16:9 ratio

    page.drawText('STORYBOARD / GUION GRÁFICO', {
      x: marginPt,
      y: a4Height - marginPt + 2,
      size: 8,
      color: rgb(0.2, 0.2, 0.2),
    });

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const boxX = marginPt + c * (colW + mmToPt(12));
        const boxY = a4Height - marginPt - (r + 1) * rowH;

        // Drawing frame
        page.drawRectangle({
          x: boxX,
          y: boxY + (rowH - frameH),
          width: colW,
          height: frameH,
          borderColor: rgb(0.15, 0.15, 0.15),
          borderWidth: 1,
          color: rgb(0.99, 0.99, 0.99),
        });

        // Frame number
        page.drawText(`ESCENA ${r * 2 + c + 1}`, {
          x: boxX + 4,
          y: boxY + (rowH - frameH) + frameH - 10,
          size: 6,
          color: rgb(0.4, 0.4, 0.4),
        });

        // Audio & Action lines
        page.drawLine({
          start: { x: boxX, y: boxY + 28 },
          end: { x: boxX + colW, y: boxY + 28 },
          thickness: 0.3,
          color: rgb(0.8, 0.8, 0.8),
        });
        page.drawText('Acción:', { x: boxX, y: boxY + 30, size: 6, color: rgb(0.4, 0.4, 0.4) });

        page.drawLine({
          start: { x: boxX, y: boxY + 12 },
          end: { x: boxX + colW, y: boxY + 12 },
          thickness: 0.3,
          color: rgb(0.8, 0.8, 0.8),
        });
        page.drawText('Audio / Diálogo:', { x: boxX, y: boxY + 14, size: 6, color: rgb(0.4, 0.4, 0.4) });
      }
    }
  } else if (config.type === 'wireframe') {
    // UI Wireframe: 3 smartphone frames side by side with home bar and dot grid
    const phoneW = (usableW - mmToPt(16)) / 3;
    const phoneH = phoneW * (19.5 / 9); // modern 19.5:9 phone ratio
    const startY = (usableH - phoneH) / 2 + marginPt;

    page.drawText('BOCETOS DE INTERFAZ / MOBILE APP WIREFRAMES', {
      x: marginPt,
      y: a4Height - marginPt + 2,
      size: 8,
      color: rgb(0.2, 0.2, 0.2),
    });

    for (let p = 0; p < 3; p++) {
      const px = marginPt + p * (phoneW + mmToPt(8));

      // Phone body
      page.drawRectangle({
        x: px,
        y: startY,
        width: phoneW,
        height: phoneH,
        borderColor: rgb(0.2, 0.2, 0.2),
        borderWidth: 1.2,
        color: rgb(1, 1, 1),
      });

      // Top notch / dynamic island pill
      const notchW = phoneW * 0.32;
      page.drawRectangle({
        x: px + (phoneW - notchW) / 2,
        y: startY + phoneH - 10,
        width: notchW,
        height: 6,
        borderColor: rgb(0.3, 0.3, 0.3),
        borderWidth: 0.6,
        color: rgb(0.9, 0.9, 0.9),
      });

      // Bottom home indicator bar
      const barW = phoneW * 0.35;
      page.drawLine({
        start: { x: px + (phoneW - barW) / 2, y: startY + 8 },
        end: { x: px + (phoneW + barW) / 2, y: startY + 8 },
        thickness: 1.5,
        color: rgb(0.4, 0.4, 0.4),
      });

      // Light dot grid inside phone
      const step = mmToPt(5);
      for (let x = px + 10; x < px + phoneW - 10; x += step) {
        for (let y = startY + 20; y < startY + phoneH - 20; y += step) {
          page.drawCircle({ x, y, size: 0.3, color: rgb(0.65, 0.7, 0.8), opacity: 0.5 });
        }
      }

      // Screen title line below phone
      page.drawLine({
        start: { x: px, y: startY - 14 },
        end: { x: px + phoneW, y: startY - 14 },
        thickness: 0.4,
        color: rgb(0.7, 0.7, 0.7),
      });
      page.drawText(`Pantalla ${p + 1}: _____________________`, {
        x: px,
        y: startY - 12,
        size: 6.5,
        color: rgb(0.4, 0.4, 0.4),
      });
    }
  } else if (config.type === 'habittracker') {
    // 31-Day Habit Tracker Table
    const headerH = mmToPt(16);
    page.drawText('SEGUIMIENTO DE HÁBITOS MENSUAL / MONTHLY HABIT TRACKER', {
      x: marginPt,
      y: a4Height - marginPt - 12,
      size: 9,
      color: rgb(0.1, 0.1, 0.1),
    });
    page.drawText('MES / MONTH: ________________________', {
      x: a4Width - marginPt - mmToPt(65),
      y: a4Height - marginPt - 12,
      size: 8,
      color: rgb(0.2, 0.2, 0.2),
    });

    const habitColW = mmToPt(55);
    const dayColW = (usableW - habitColW) / 31;
    const numHabits = 20;
    const rowH = (usableH - headerH - mmToPt(10)) / (numHabits + 1);
    const tableTop = a4Height - marginPt - headerH;

    // Header row
    page.drawRectangle({
      x: marginPt,
      y: tableTop - rowH,
      width: usableW,
      height: rowH,
      borderColor: rgb(0.2, 0.2, 0.2),
      borderWidth: 0.8,
      color: rgb(0.94, 0.95, 0.98),
    });
    page.drawText('HÁBITO / OBJETIVO', {
      x: marginPt + 4,
      y: tableTop - rowH + 4,
      size: 7,
      color: rgb(0.2, 0.2, 0.2),
    });

    for (let d = 1; d <= 31; d++) {
      const dx = marginPt + habitColW + (d - 1) * dayColW;
      page.drawLine({
        start: { x: dx, y: tableTop - rowH },
        end: { x: dx, y: tableTop - (numHabits + 1) * rowH },
        thickness: 0.3,
        color: rgb(0.7, 0.7, 0.7),
      });
      page.drawText(`${d}`, {
        x: dx + 1,
        y: tableTop - rowH + 4,
        size: 5.5,
        color: rgb(0.2, 0.2, 0.2),
      });
    }

    // Rows
    for (let h = 1; h <= numHabits; h++) {
      const ry = tableTop - (h + 1) * rowH;
      page.drawRectangle({
        x: marginPt,
        y: ry,
        width: usableW,
        height: rowH,
        borderColor: rgb(0.75, 0.75, 0.75),
        borderWidth: 0.4,
      });
      // Checkbox circle in each day cell
      for (let d = 1; d <= 31; d++) {
        const cx = marginPt + habitColW + (d - 0.5) * dayColW;
        const cy = ry + rowH / 2;
        page.drawCircle({
          x: cx,
          y: cy,
          size: 1.8,
          borderColor: rgb(0.7, 0.75, 0.8),
          borderWidth: 0.4,
        });
      }
    }
  } else if (config.type === 'dailyplanner') {
    // Daily Time-Blocking Planner (Schedule + Top Priorities + Notes)
    const headerH = mmToPt(16);
    page.drawText('PLANIFICADOR DIARIO / DAILY TIME-BLOCKING', {
      x: marginPt,
      y: a4Height - marginPt - 12,
      size: 9,
      color: rgb(0.1, 0.1, 0.1),
    });
    page.drawText('FECHA: ______________  OBJETIVO DEL DÍA: __________________________', {
      x: a4Width - marginPt - mmToPt(110),
      y: a4Height - marginPt - 12,
      size: 7.5,
      color: rgb(0.2, 0.2, 0.2),
    });

    const bodyY = marginPt;
    const bodyH = usableH - headerH - 5;
    const leftW = usableW * 0.48;
    const rightW = usableW * 0.48;
    const rightX = marginPt + usableW - rightW;

    // Left Column: Hourly Schedule (06:00 to 22:00)
    page.drawRectangle({
      x: marginPt,
      y: bodyY,
      width: leftW,
      height: bodyH,
      borderColor: rgb(0.3, 0.3, 0.3),
      borderWidth: 0.8,
    });
    page.drawText('HORARIO / TIME BLOCKS', {
      x: marginPt + 6,
      y: bodyY + bodyH - 14,
      size: 7.5,
      color: rgb(0.2, 0.2, 0.2),
    });

    const hours = [
      '06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00',
      '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00',
      '20:00', '21:00', '22:00'
    ];
    const hourStep = (bodyH - 24) / hours.length;
    for (let i = 0; i < hours.length; i++) {
      const hy = bodyY + bodyH - 24 - (i + 1) * hourStep;
      page.drawLine({
        start: { x: marginPt, y: hy },
        end: { x: marginPt + leftW, y: hy },
        thickness: 0.35,
        color: rgb(0.75, 0.75, 0.75),
      });
      page.drawText(hours[i], {
        x: marginPt + 4,
        y: hy + 3,
        size: 6.5,
        color: rgb(0.3, 0.3, 0.3),
      });
    }

    // Right Column Box 1: Top 3 Priorities
    const prioH = bodyH * 0.28;
    page.drawRectangle({
      x: rightX,
      y: bodyY + bodyH - prioH,
      width: rightW,
      height: prioH,
      borderColor: rgb(0.3, 0.3, 0.3),
      borderWidth: 0.8,
      color: rgb(0.98, 0.98, 0.99),
    });
    page.drawText('TOP 3 PRIORIDADES DEL DÍA', {
      x: rightX + 6,
      y: bodyY + bodyH - 14,
      size: 7.5,
      color: rgb(0.2, 0.2, 0.2),
    });
    for (let p = 0; p < 3; p++) {
      const py = bodyY + bodyH - 26 - p * 24;
      page.drawRectangle({
        x: rightX + 8,
        y: py - 2,
        width: 10,
        height: 10,
        borderColor: rgb(0.4, 0.4, 0.4),
        borderWidth: 0.8,
      });
      page.drawLine({
        start: { x: rightX + 24, y: py + 2 },
        end: { x: rightX + rightW - 8, y: py + 2 },
        thickness: 0.4,
        color: rgb(0.75, 0.75, 0.75),
      });
    }

    // Right Column Box 2: To-Do Tasks
    const todoH = bodyH * 0.42;
    const todoY = bodyY + bodyH - prioH - todoH - 8;
    page.drawRectangle({
      x: rightX,
      y: todoY,
      width: rightW,
      height: todoH,
      borderColor: rgb(0.3, 0.3, 0.3),
      borderWidth: 0.8,
    });
    page.drawText('LISTA DE TAREAS / TO-DO', {
      x: rightX + 6,
      y: todoY + todoH - 14,
      size: 7.5,
      color: rgb(0.2, 0.2, 0.2),
    });
    for (let t = 0; t < 6; t++) {
      const ty = todoY + todoH - 26 - t * 18;
      page.drawRectangle({
        x: rightX + 8,
        y: ty - 2,
        width: 8,
        height: 8,
        borderColor: rgb(0.5, 0.5, 0.5),
        borderWidth: 0.6,
      });
      page.drawLine({
        start: { x: rightX + 22, y: ty + 2 },
        end: { x: rightX + rightW - 8, y: ty + 2 },
        thickness: 0.3,
        color: rgb(0.8, 0.8, 0.8),
      });
    }

    // Right Column Box 3: Notes & Gratitude
    const noteH = todoY - bodyY - 8;
    page.drawRectangle({
      x: rightX,
      y: bodyY,
      width: rightW,
      height: noteH,
      borderColor: rgb(0.3, 0.3, 0.3),
      borderWidth: 0.8,
    });
    page.drawText('NOTAS & REFLEXIÓN', {
      x: rightX + 6,
      y: bodyY + noteH - 14,
      size: 7.5,
      color: rgb(0.2, 0.2, 0.2),
    });
    for (let ny = bodyY + 12; ny < bodyY + noteH - 20; ny += 16) {
      page.drawLine({
        start: { x: rightX + 6, y: ny },
        end: { x: rightX + rightW - 6, y: ny },
        thickness: 0.3,
        color: rgb(0.8, 0.8, 0.8),
      });
    }
  } else if (config.type === 'calligraphy') {
    // Copperplate 55° Slanted Calligraphy Ruling
    const baseHeightPt = mmToPt(5);
    const ascenderPt = mmToPt(7.5);
    const descenderPt = mmToPt(7.5);
    const rowTotalPt = ascenderPt + baseHeightPt + descenderPt + mmToPt(6);
    const numRows = Math.floor(usableH / rowTotalPt);

    const slantRad = (55 * Math.PI) / 180;
    const tanSlant = Math.tan(slantRad);

    for (let r = 0; r < numRows; r++) {
      const rowBaseY = a4Height - marginPt - (r + 1) * rowTotalPt + descenderPt;

      // Descender line (bottom)
      page.drawLine({
        start: { x: marginPt, y: rowBaseY - descenderPt },
        end: { x: a4Width - marginPt, y: rowBaseY - descenderPt },
        thickness: 0.3,
        color: rgb(0.7, 0.75, 0.8),
      });

      // Baseline (solid)
      page.drawLine({
        start: { x: marginPt, y: rowBaseY },
        end: { x: a4Width - marginPt, y: rowBaseY },
        thickness: 0.7,
        color: rgb(0.2, 0.2, 0.2),
      });

      // Waistline (x-height)
      page.drawLine({
        start: { x: marginPt, y: rowBaseY + baseHeightPt },
        end: { x: a4Width - marginPt, y: rowBaseY + baseHeightPt },
        thickness: 0.4,
        color: rgb(0.3, 0.5, 0.8),
      });

      // Ascender line (top)
      page.drawLine({
        start: { x: marginPt, y: rowBaseY + baseHeightPt + ascenderPt },
        end: { x: a4Width - marginPt, y: rowBaseY + baseHeightPt + ascenderPt },
        thickness: 0.3,
        color: rgb(0.7, 0.75, 0.8),
      });

      // 55 degree slant guide lines across this row
      const slantSpacing = mmToPt(12);
      const rowTop = rowBaseY + baseHeightPt + ascenderPt;
      const rowBot = rowBaseY - descenderPt;
      const dx = (rowTop - rowBot) / tanSlant;

      for (let sx = marginPt; sx <= a4Width - marginPt; sx += slantSpacing) {
        page.drawLine({
          start: { x: sx, y: rowBot },
          end: { x: sx + dx, y: rowTop },
          thickness: 0.25,
          color: rgb(0.75, 0.8, 0.88),
          opacity: 0.6,
        });
      }
    }
  } else {
    // Planner weekly / daily checklist
    const headerHeight = mmToPt(18);
    // Draw top header box
    page.drawRectangle({
      x: marginPt,
      y: a4Height - marginPt - headerHeight,
      width: usableW,
      height: headerHeight,
      borderColor: rgb(0.2, 0.2, 0.2),
      borderWidth: 1,
      color: rgb(0.96, 0.97, 0.98),
    });
    page.drawText('PLANIFICADOR SEMANAL / WEEKLY PLANNER', {
      x: marginPt + 15,
      y: a4Height - marginPt - headerHeight + 18,
      size: 11,
      color: rgb(0.1, 0.1, 0.1),
    });

    // 7 day columns
    const colW = usableW / 7;
    const bodyH = usableH - headerHeight - mmToPt(5);
    const dayNames = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', 'DOMINGO'];
    for (let c = 0; c < 7; c++) {
      const colX = marginPt + c * colW;
      page.drawRectangle({
        x: colX,
        y: marginPt,
        width: colW,
        height: bodyH,
        borderColor: rgb(0.7, 0.7, 0.7),
        borderWidth: 0.5,
      });
      // Day header
      page.drawText(dayNames[c], {
        x: colX + 4,
        y: marginPt + bodyH - 14,
        size: 7,
        color: rgb(0.2, 0.2, 0.2),
      });
      // Hourly note lines
      for (let lineY = marginPt + 20; lineY < marginPt + bodyH - 25; lineY += 24) {
        page.drawLine({
          start: { x: colX + 3, y: lineY },
          end: { x: colX + colW - 3, y: lineY },
          thickness: 0.3,
          color: rgb(0.85, 0.85, 0.85),
        });
      }
    }
  }

  return await destDoc.save();
}

/**
 * 1. Gutter Margin & Hole Punch Compensation
 * Adds inner binding margin (with optional alternating duplex shift)
 * and optional hole punch / spiral guides without cutting into text.
 */
export async function createGutterMarginPdf(
  sourcePdfBytes: Uint8Array,
  config: GutterMarginConfig
): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(sourcePdfBytes);
  const destDoc = await PDFDocument.create();
  const pageCount = srcDoc.getPageCount();
  const embeddedPages = await embedAllPdfPages(destDoc, srcDoc);
  const marginPt = mmToPt(config.marginMm);

  for (let i = 0; i < pageCount; i++) {
    const origPage = srcDoc.getPage(i);
    const { width: origW, height: origH } = origPage.getSize();
    const isOdd = (i + 1) % 2 === 1;

    // Single-sided vs alternating duplex margin
    let gutterSide: 'left' | 'right' | 'top' = config.position;
    if (config.duplexAlternating && (config.position === 'left' || config.position === 'right')) {
      gutterSide = isOdd ? 'left' : 'right';
    }

    const newPage = destDoc.addPage([origW, origH]);
    const embedded = embeddedPages[i];

    let renderW = origW;
    let renderH = origH;
    let posX = 0;
    let posY = 0;

    if (config.scaleToFit) {
      if (gutterSide === 'left' || gutterSide === 'right') {
        const scale = (origW - marginPt) / origW;
        renderW = origW * scale;
        renderH = origH * scale;
        posY = (origH - renderH) / 2;
        posX = gutterSide === 'left' ? marginPt : 0;
      } else {
        const scale = (origH - marginPt) / origH;
        renderW = origW * scale;
        renderH = origH * scale;
        posX = (origW - renderW) / 2;
        posY = 0;
      }
    } else {
      if (gutterSide === 'left') {
        posX = marginPt;
      } else if (gutterSide === 'right') {
        posX = -marginPt;
      } else if (gutterSide === 'top') {
        posY = -marginPt;
      }
    }

    newPage.drawPage(embedded, {
      x: posX,
      y: posY,
      width: renderW,
      height: renderH,
    });

    // Optional Punch Hole and Binding Guides
    if (config.punchHolesGuide !== 'none' && (gutterSide === 'left' || gutterSide === 'right')) {
      const guideColor = rgb(0.72, 0.72, 0.75);
      const holeRadius = mmToPt(3); // 6mm standard punch hole
      const holeX = gutterSide === 'left' ? marginPt / 2 : origW - marginPt / 2;

      if (config.punchHolesGuide === '2_holes') {
        // Standard 2-hole: 80mm apart, centered
        const center = origH / 2;
        const distFromCenter = mmToPt(40);
        [center - distFromCenter, center + distFromCenter].forEach(y => {
          newPage.drawCircle({ x: holeX, y, size: holeRadius, borderColor: guideColor, borderWidth: 0.8 });
          newPage.drawLine({ start: { x: holeX - 4, y }, end: { x: holeX + 4, y }, thickness: 0.5, color: guideColor });
          newPage.drawLine({ start: { x: holeX, y: y - 4 }, end: { x: holeX, y: y + 4 }, thickness: 0.5, color: guideColor });
        });
      } else if (config.punchHolesGuide === '4_holes') {
        // Standard 4-hole: 80mm between each (total 240mm)
        const center = origH / 2;
        const offsets = [-120, -40, 40, 120];
        offsets.forEach(offMm => {
          const y = center + mmToPt(offMm);
          if (y > 10 && y < origH - 10) {
            newPage.drawCircle({ x: holeX, y, size: holeRadius, borderColor: guideColor, borderWidth: 0.8 });
            newPage.drawLine({ start: { x: holeX - 4, y }, end: { x: holeX + 4, y }, thickness: 0.5, color: guideColor });
            newPage.drawLine({ start: { x: holeX, y: y - 4 }, end: { x: holeX, y: y + 4 }, thickness: 0.5, color: guideColor });
          }
        });
      } else if (config.punchHolesGuide === 'spiral') {
        // Spiral: holes every 12.7mm (1/2")
        const stepPt = mmToPt(12.7);
        const marginMargin = mmToPt(15);
        for (let y = marginMargin; y <= origH - marginMargin; y += stepPt) {
          newPage.drawCircle({ x: holeX, y, size: mmToPt(1.8), borderColor: guideColor, borderWidth: 0.6 });
        }
      }

      // Dotted margin guideline
      const lineX = gutterSide === 'left' ? marginPt : origW - marginPt;
      for (let y = 10; y < origH - 10; y += 12) {
        newPage.drawLine({
          start: { x: lineX, y },
          end: { x: lineX, y: Math.min(y + 6, origH - 10) },
          thickness: 0.4,
          color: guideColor,
        });
      }
    }
  }

  return await destDoc.save();
}

/**
 * 2. Smart Crop & Content Maximizer
 * Strips dead margins and scales cropped content to 95% of target page.
 */
export interface CropBoxNormalized {
  x: number;      // 0 - 1
  y: number;      // 0 - 1 (from top)
  width: number;  // 0 - 1
  height: number; // 0 - 1
}

export async function createSmartCropPdf(
  sourcePdfBytes: Uint8Array,
  cropBox: CropBoxNormalized,
  targetSize: 'keep' | 'a4' | 'letter',
  fillPage: boolean
): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(sourcePdfBytes);
  const destDoc = await PDFDocument.create();
  const pageCount = srcDoc.getPageCount();
  const embeddedPages = await embedAllPdfPages(destDoc, srcDoc);

  const standardA4 = [mmToPt(210), mmToPt(297)];
  const standardLetter = [mmToPt(215.9), mmToPt(279.4)];

  for (let i = 0; i < pageCount; i++) {
    const origPage = srcDoc.getPage(i);
    const { width: origW, height: origH } = origPage.getSize();

    const cropW_pt = Math.max(20, origW * cropBox.width);
    const cropH_pt = Math.max(20, origH * cropBox.height);
    const cropX_pt = origW * cropBox.x;
    const cropY_pt = origH * (1 - cropBox.y - cropBox.height);

    let targetW = cropW_pt;
    let targetH = cropH_pt;

    if (targetSize === 'a4') {
      const isLandscape = cropW_pt > cropH_pt;
      targetW = isLandscape ? standardA4[1] : standardA4[0];
      targetH = isLandscape ? standardA4[0] : standardA4[1];
    } else if (targetSize === 'letter') {
      const isLandscape = cropW_pt > cropH_pt;
      targetW = isLandscape ? standardLetter[1] : standardLetter[0];
      targetH = isLandscape ? standardLetter[0] : standardLetter[1];
    }

    const newPage = destDoc.addPage([targetW, targetH]);
    const embedded = embeddedPages[i];

    if (fillPage) {
      const marginSafety = mmToPt(6); // 6mm physical printer safe margin
      const usableW = targetW - marginSafety * 2;
      const usableH = targetH - marginSafety * 2;
      const scale = Math.min(usableW / cropW_pt, usableH / cropH_pt);

      const renderW = origW * scale;
      const renderH = origH * scale;

      const centeredX = marginSafety + (usableW - cropW_pt * scale) / 2;
      const centeredY = marginSafety + (usableH - cropH_pt * scale) / 2;

      const destX = centeredX - cropX_pt * scale;
      const destY = centeredY - cropY_pt * scale;

      newPage.drawPage(embedded, {
        x: destX,
        y: destY,
        width: renderW,
        height: renderH,
      });
    } else {
      newPage.drawPage(embedded, {
        x: -cropX_pt,
        y: -cropY_pt,
        width: origW,
        height: origH,
      });
    }
  }

  return await destDoc.save();
}

/**
 * 3. Auto-Rotate Orientation Normalizer
 * Normalizes mixed portrait and landscape documents to uniform orientation.
 */
export async function createAutoRotatePdf(
  sourcePdfBytes: Uint8Array,
  targetOrientation: 'portrait' | 'landscape' | 'uniform'
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(sourcePdfBytes);
  const pageCount = doc.getPageCount();

  let target: 'portrait' | 'landscape' = 'portrait';
  if (targetOrientation === 'uniform') {
    let portraitCount = 0;
    let landscapeCount = 0;
    for (let i = 0; i < pageCount; i++) {
      const p = doc.getPage(i);
      const { width, height } = p.getSize();
      if (width > height) landscapeCount++;
      else portraitCount++;
    }
    target = portraitCount >= landscapeCount ? 'portrait' : 'landscape';
  } else {
    target = targetOrientation;
  }

  for (let i = 0; i < pageCount; i++) {
    const page = doc.getPage(i);
    const { width, height } = page.getSize();
    const currentRot = page.getRotation().angle;
    const isLandscape = width > height;

    if (target === 'portrait' && isLandscape) {
      page.setRotation(degrees((currentRot + 90) % 360));
    } else if (target === 'landscape' && !isLandscape) {
      page.setRotation(degrees((currentRot + 90) % 360));
    }
  }

  return await doc.save();
}

/**
 * 4. Reverse Print Order (N -> 1)
 * Inverts page order for face-up printer trays or manual duplex feeds.
 */
export async function createReverseOrderPdf(
  sourcePdfBytes: Uint8Array,
  reverseMode: 'all' | 'even_odd_split'
): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(sourcePdfBytes);
  const destDoc = await PDFDocument.create();
  const pageCount = srcDoc.getPageCount();

  if (reverseMode === 'all') {
    const indices = Array.from({ length: pageCount }, (_, idx) => pageCount - 1 - idx);
    const copiedPages = await destDoc.copyPages(srcDoc, indices);
    copiedPages.forEach(p => destDoc.addPage(p));
  } else {
    const oddIndices: number[] = [];
    const evenIndices: number[] = [];
    for (let i = 0; i < pageCount; i++) {
      if ((i + 1) % 2 === 1) oddIndices.push(i);
      else evenIndices.push(i);
    }
    evenIndices.reverse();
    const allIndices = [...oddIndices, ...evenIndices];
    const copiedPages = await destDoc.copyPages(srcDoc, allIndices);
    copiedPages.forEach(p => destDoc.addPage(p));
  }

  return await destDoc.save();
}

/**
 * 5. Print Stamp / Ink-Saving Watermark
 * Stamps diagonal DRAFT/CONFIDENTIAL/EXAM watermarks with outline toner-saver or tint.
 */
export async function createPrintStampPdf(
  sourcePdfBytes: Uint8Array,
  config: PrintStampConfig
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(sourcePdfBytes);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const pageCount = doc.getPageCount();

  const stampText = config.customText.trim() || 'BORRADOR';
  const colorRgb = hexToRgb(config.color);
  const stampColor = rgb(colorRgb.r, colorRgb.g, colorRgb.b);

  for (let i = 0; i < pageCount; i++) {
    if (config.pages === 'first' && i > 0) continue;
    if (config.pages === 'exclude_first' && i === 0) continue;

    const page = doc.getPage(i);
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(stampText, config.fontSize);
    const textHeight = font.heightAtSize(config.fontSize);

    if (config.position === 'diagonal') {
      const centerX = width / 2;
      const centerY = height / 2;

      // 45 degrees rotation
      page.drawText(stampText, {
        x: centerX - (textWidth / 2) * Math.cos(Math.PI / 4) + (textHeight / 2) * Math.sin(Math.PI / 4),
        y: centerY - (textWidth / 2) * Math.sin(Math.PI / 4) - (textHeight / 2) * Math.cos(Math.PI / 4),
        size: config.fontSize,
        font,
        color: stampColor,
        opacity: config.style === 'outline' ? 0.2 : config.opacity,
        rotate: degrees(45),
      });

      if (config.style === 'outline') {
        const boxPadding = 12;
        const boxW = textWidth + boxPadding * 2;
        const boxH = textHeight + boxPadding * 2;
        page.drawRectangle({
          x: centerX - (boxW / 2) * Math.cos(Math.PI / 4) + (boxH / 2) * Math.sin(Math.PI / 4),
          y: centerY - (boxW / 2) * Math.sin(Math.PI / 4) - (boxH / 2) * Math.cos(Math.PI / 4),
          width: boxW,
          height: boxH,
          borderColor: stampColor,
          borderWidth: 2,
          borderOpacity: 0.25,
          rotate: degrees(45),
        });
      }
    } else if (config.position === 'header') {
      const posX = (width - textWidth) / 2;
      const posY = height - mmToPt(12);
      page.drawText(stampText, {
        x: posX,
        y: posY,
        size: Math.min(config.fontSize, 18),
        font,
        color: stampColor,
        opacity: config.opacity,
      });
      page.drawLine({
        start: { x: mmToPt(15), y: posY - 4 },
        end: { x: width - mmToPt(15), y: posY - 4 },
        thickness: 0.8,
        color: stampColor,
        opacity: config.opacity * 0.8,
      });
    } else if (config.position === 'footer') {
      const posX = (width - textWidth) / 2;
      const posY = mmToPt(10);
      page.drawText(stampText, {
        x: posX,
        y: posY,
        size: Math.min(config.fontSize, 16),
        font,
        color: stampColor,
        opacity: config.opacity,
      });
    }
  }

  return await doc.save();
}

/**
 * Splits a source PDF into two separate lossless vector PDFs: one containing only color pages,
 * and one containing only black & white / grayscale pages for dramatic copistería cost savings.
 */
export async function splitPdfByColor(
  sourcePdfBytes: Uint8Array,
  colorPageNumbers: number[], // 1-based indices
  bwPageNumbers: number[]     // 1-based indices
): Promise<{ colorPdfBytes: Uint8Array | null; bwPdfBytes: Uint8Array | null }> {
  const sourceDoc = await PDFDocument.load(sourcePdfBytes);

  let colorPdfBytes: Uint8Array | null = null;
  let bwPdfBytes: Uint8Array | null = null;

  if (colorPageNumbers.length > 0) {
    const colorDoc = await PDFDocument.create();
    const colorIndices = colorPageNumbers.map((p) => p - 1);
    const copiedColorPages = await colorDoc.copyPages(sourceDoc, colorIndices);
    copiedColorPages.forEach((page) => colorDoc.addPage(page));
    colorPdfBytes = await colorDoc.save();
  }

  if (bwPageNumbers.length > 0) {
    const bwDoc = await PDFDocument.create();
    const bwIndices = bwPageNumbers.map((p) => p - 1);
    const copiedBwPages = await bwDoc.copyPages(sourceDoc, bwIndices);
    copiedBwPages.forEach((page) => bwDoc.addPage(page));
    bwPdfBytes = await bwDoc.save();
  }

  return { colorPdfBytes, bwPdfBytes };
}

/**
 * Generates an A4 sheet with customized lever-arch binder spine labels ready to print & cut.
 */
export async function createBinderSpinePdf(config: BinderSpineConfig): Promise<Uint8Array> {
  const destDoc = await PDFDocument.create();
  const font = await destDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await destDoc.embedFont(StandardFonts.Helvetica);

  // A4 Portrait dimensions: 210mm x 297mm
  const a4W = mmToPt(210);
  const a4H = mmToPt(297);

  const spineWPt = mmToPt(config.widthMm);
  const spineHPt = mmToPt(config.heightMm);

  // Calculate columns fitting across A4
  const maxPossibleCols = Math.max(1, Math.floor((210 - 10) / config.widthMm));
  const cols = Math.max(1, Math.min(config.quantityPerPage, maxPossibleCols));
  const totalW = cols * spineWPt;
  const startX = (a4W - totalW) / 2;
  const startY = (a4H - spineHPt) / 2;

  const page = destDoc.addPage([a4W, a4H]);

  // Top header instruction note
  if (startY > mmToPt(12)) {
    page.drawText('ImpressReady — Lomos de Archivador & Carpetas (Imprimir a escala 100% / Ajuste real)', {
      x: mmToPt(15),
      y: a4H - mmToPt(10),
      size: 8,
      font: regularFont,
      color: rgb(0.45, 0.45, 0.45),
    });
  }

  const bandColor = hexToRgb(config.colorBand);

  for (let c = 0; c < cols; c++) {
    const x = startX + c * spineWPt;
    const y = startY;

    // 1. Spine label card background
    page.drawRectangle({
      x,
      y,
      width: spineWPt,
      height: spineHPt,
      color: rgb(1, 1, 1),
      borderColor: rgb(0.85, 0.85, 0.85),
      borderWidth: 0.5,
    });

    // 2. Cutting guide lines (dashed boundary extending slightly beyond margins)
    const ext = mmToPt(6);
    // Vertical cuts
    page.drawLine({
      start: { x, y: Math.max(0, y - ext) },
      end: { x, y: Math.min(a4H, y + spineHPt + ext) },
      thickness: 0.5,
      color: rgb(0.65, 0.65, 0.65),
      dashArray: [3, 3],
    });
    page.drawLine({
      start: { x: x + spineWPt, y: Math.max(0, y - ext) },
      end: { x: x + spineWPt, y: Math.min(a4H, y + spineHPt + ext) },
      thickness: 0.5,
      color: rgb(0.65, 0.65, 0.65),
      dashArray: [3, 3],
    });
    // Horizontal cuts
    page.drawLine({
      start: { x: Math.max(0, x - ext), y },
      end: { x: Math.min(a4W, x + spineWPt + ext), y },
      thickness: 0.5,
      color: rgb(0.65, 0.65, 0.65),
      dashArray: [3, 3],
    });
    page.drawLine({
      start: { x: Math.max(0, x - ext), y: y + spineHPt },
      end: { x: Math.min(a4W, x + spineWPt + ext), y: y + spineHPt },
      thickness: 0.5,
      color: rgb(0.65, 0.65, 0.65),
      dashArray: [3, 3],
    });

    // 3. Top Color Band
    const bandHeightPt = mmToPt(config.colorBandHeightMm);
    const bandY = y + spineHPt - bandHeightPt;
    page.drawRectangle({
      x,
      y: bandY,
      width: spineWPt,
      height: bandHeightPt,
      color: rgb(bandColor.r, bandColor.g, bandColor.b),
    });

    // Volume number inside color band
    if (config.volumeNumber) {
      const volSize = Math.min(22, Math.max(12, spineWPt * 0.28));
      const volText = config.volumeNumber;
      const volWidth = font.widthOfTextAtSize(volText, volSize);
      page.drawText(volText, {
        x: x + (spineWPt - volWidth) / 2,
        y: bandY + (bandHeightPt - volSize) / 2 + 2,
        size: volSize,
        font,
        color: rgb(1, 1, 1),
      });
    }

    // Category / Tag right below color band
    if (config.category) {
      const catSize = 8;
      const catText = config.category.toUpperCase();
      const catW = regularFont.widthOfTextAtSize(catText, catSize);
      page.drawText(catText, {
        x: x + (spineWPt - catW) / 2,
        y: bandY - 14,
        size: catSize,
        font: regularFont,
        color: rgb(0.35, 0.35, 0.35),
      });
    }

    // 4. Main Title
    if (config.title) {
      if (config.textOrientation === 'vertical') {
        const titleSize = Math.min(18, Math.max(11, spineWPt * 0.26));
        const titleText = config.title;
        const startTextY = bandY - (config.category ? 26 : 14);

        page.drawText(titleText, {
          x: x + spineWPt / 2 + titleSize * 0.35,
          y: startTextY,
          size: titleSize,
          font,
          color: rgb(0.1, 0.15, 0.2),
          rotate: degrees(-90),
        });

        if (config.subtitle) {
          const subSize = Math.max(8, titleSize - 4);
          const subText = config.subtitle;
          page.drawText(subText, {
            x: x + spineWPt / 2 - subSize * 0.7,
            y: startTextY,
            size: subSize,
            font: regularFont,
            color: rgb(0.45, 0.45, 0.45),
            rotate: degrees(-90),
          });
        }
      } else {
        // Horizontal orientation
        const titleSize = Math.min(14, Math.max(9, spineWPt * 0.16));
        const words = config.title.split(' ');
        let curY = bandY - (config.category ? 26 : 18);
        let currentLine = '';

        for (const word of words) {
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          if (font.widthOfTextAtSize(testLine, titleSize) > spineWPt - mmToPt(6)) {
            const lineW = font.widthOfTextAtSize(currentLine, titleSize);
            page.drawText(currentLine, {
              x: x + (spineWPt - lineW) / 2,
              y: curY,
              size: titleSize,
              font,
              color: rgb(0.1, 0.15, 0.2),
            });
            curY -= titleSize + 4;
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }
        if (currentLine) {
          const lineW = font.widthOfTextAtSize(currentLine, titleSize);
          page.drawText(currentLine, {
            x: x + (spineWPt - lineW) / 2,
            y: curY,
            size: titleSize,
            font,
            color: rgb(0.1, 0.15, 0.2),
          });
          curY -= titleSize + 5;
        }

        if (config.subtitle) {
          const subSize = 8;
          const subW = regularFont.widthOfTextAtSize(config.subtitle, subSize);
          page.drawText(config.subtitle, {
            x: x + (spineWPt - subW) / 2,
            y: curY,
            size: subSize,
            font: regularFont,
            color: rgb(0.45, 0.45, 0.45),
          });
        }
      }
    }

    // 5. Thumb hole indicator (Ojal metálico de archivador de palanca)
    if (config.hasThumbHole) {
      const holeRadius = mmToPt(14); // 28mm standard thumb hole
      const holeCenterY = y + mmToPt(config.thumbHoleDistMm);
      const holeCenterX = x + spineWPt / 2;

      page.drawCircle({
        x: holeCenterX,
        y: holeCenterY,
        size: holeRadius,
        borderColor: rgb(0.65, 0.65, 0.65),
        borderWidth: 0.8,
        borderDashArray: [3, 2],
      });
      page.drawCircle({
        x: holeCenterX,
        y: holeCenterY,
        size: 1.5,
        color: rgb(0.65, 0.65, 0.65),
      });
    }

    // 6. Optional handwriting lines at bottom of label
    if (config.includeLines) {
      const bottomLinesY = y + mmToPt(14);
      for (let l = 0; l < 4; l++) {
        page.drawLine({
          start: { x: x + mmToPt(5), y: bottomLinesY + l * mmToPt(6) },
          end: { x: x + spineWPt - mmToPt(5), y: bottomLinesY + l * mmToPt(6) },
          thickness: 0.5,
          color: rgb(0.85, 0.85, 0.85),
        });
      }
    }
  }

  return await destDoc.save();
}

/**
 * Imposes a multi-page PDF into a ready-to-fold 2-page Duplex brochure (Bi-fold or Tri-fold)
 * with precise fold crease marks.
 */
export async function createBrochureFoldPdf(
  sourcePdfBytes: Uint8Array,
  config: BrochureFoldConfig
): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(sourcePdfBytes);
  const totalSrcPages = srcDoc.getPageCount();

  const destDoc = await PDFDocument.create();
  const embeddedPages = await embedAllPdfPages(destDoc, srcDoc);

  const isA3 = config.paperSize === 'a3_landscape';
  const sheetW = isA3 ? mmToPt(420) : mmToPt(297);
  const sheetH = isA3 ? mmToPt(297) : mmToPt(210);

  const drawFoldTickMarks = (sheet: any, xPositions: number[]) => {
    if (!config.includeFoldMarks && !config.includeFoldLines) return;
    for (const xPos of xPositions) {
      if (config.includeFoldLines) {
        // Full subtle dashed line through sheet
        sheet.drawLine({
          start: { x: xPos, y: 0 },
          end: { x: xPos, y: sheetH },
          thickness: 0.5,
          color: rgb(0.75, 0.75, 0.75),
          dashArray: [3, 3],
        });
      }
      if (config.includeFoldMarks) {
        // 5mm guide marks at margins
        sheet.drawLine({
          start: { x: xPos, y: 0 },
          end: { x: xPos, y: mmToPt(5) },
          thickness: 0.9,
          color: rgb(0.3, 0.3, 0.3),
        });
        sheet.drawLine({
          start: { x: xPos, y: sheetH },
          end: { x: xPos, y: sheetH - mmToPt(5) },
          thickness: 0.9,
          color: rgb(0.3, 0.3, 0.3),
        });
      }
    }
  };

  const drawSlot = (
    sheet: any,
    pageIndex: number,
    x: number,
    y: number,
    w: number,
    h: number
  ) => {
    if (pageIndex < 0 || pageIndex >= embeddedPages.length) return;
    const embedded = embeddedPages[pageIndex];
    const origW = embedded.width;
    const origH = embedded.height;

    const margin = mmToPt(config.marginMm);
    const usableW = Math.max(10, w - margin * 2);
    const usableH = Math.max(10, h - margin * 2);

    const scale = Math.min(usableW / origW, usableH / origH);
    const renderW = origW * scale;
    const renderH = origH * scale;

    const posX = x + margin + (usableW - renderW) / 2;
    const posY = y + margin + (usableH - renderH) / 2;

    sheet.drawPage(embedded, {
      x: posX,
      y: posY,
      width: renderW,
      height: renderH,
    });
  };

  if (config.foldType === 'bifold') {
    // Bi-fold (Díptico): 4 virtual panels across 2 duplex sheets
    const halfW = sheetW / 2;

    // Sheet 1 - Exterior (Left = Back Cover p4/idx 3, Right = Front Cover p1/idx 0)
    const sheet1 = destDoc.addPage([sheetW, sheetH]);
    drawSlot(sheet1, totalSrcPages >= 4 ? 3 : -1, 0, 0, halfW, sheetH);
    drawSlot(sheet1, 0, halfW, 0, halfW, sheetH);
    drawFoldTickMarks(sheet1, [halfW]);

    // Sheet 2 - Interior (Left = Inside Left p2/idx 1, Right = Inside Right p3/idx 2)
    const sheet2 = destDoc.addPage([sheetW, sheetH]);
    drawSlot(sheet2, totalSrcPages >= 2 ? 1 : -1, 0, 0, halfW, sheetH);
    drawSlot(sheet2, totalSrcPages >= 3 ? 2 : -1, halfW, 0, halfW, sheetH);
    drawFoldTickMarks(sheet2, [halfW]);
  } else if (config.foldType === 'trifold_c') {
    // Tri-fold in C (Letter fold): 6 panels across 2 duplex sheets
    const flapRatio = 97 / 297;
    const mainRatio = 100 / 297;

    const flapW = sheetW * flapRatio;
    const mainW = sheetW * mainRatio;

    // Sheet 1 (Exterior): Left = Solapa Interior (p5/idx 4), Center = Contraportada (p6/idx 5), Right = Portada (p1/idx 0)
    const sheet1 = destDoc.addPage([sheetW, sheetH]);
    drawSlot(sheet1, totalSrcPages >= 5 ? 4 : -1, 0, 0, flapW, sheetH);
    drawSlot(sheet1, totalSrcPages >= 6 ? 5 : -1, flapW, 0, mainW, sheetH);
    drawSlot(sheet1, 0, flapW + mainW, 0, mainW, sheetH);
    drawFoldTickMarks(sheet1, [flapW, flapW + mainW]);

    // Sheet 2 (Interior): Left = Int. Izquierda (p2/idx 1), Center = Int. Centro (p3/idx 2), Right = Int. Derecha (p4/idx 3)
    const sheet2 = destDoc.addPage([sheetW, sheetH]);
    drawSlot(sheet2, totalSrcPages >= 2 ? 1 : -1, 0, 0, mainW, sheetH);
    drawSlot(sheet2, totalSrcPages >= 3 ? 2 : -1, mainW, 0, mainW, sheetH);
    drawSlot(sheet2, totalSrcPages >= 4 ? 3 : -1, mainW * 2, 0, flapW, sheetH);
    drawFoldTickMarks(sheet2, [mainW, mainW * 2]);
  } else {
    // Tri-fold in Z (Acordeón): 3 equal panels
    const thirdW = sheetW / 3;

    // Sheet 1 (Exterior): Portada p1, Contraportada p6, Solapa p5
    const sheet1 = destDoc.addPage([sheetW, sheetH]);
    drawSlot(sheet1, 0, 0, 0, thirdW, sheetH);
    drawSlot(sheet1, totalSrcPages >= 6 ? 5 : -1, thirdW, 0, thirdW, sheetH);
    drawSlot(sheet1, totalSrcPages >= 5 ? 4 : -1, thirdW * 2, 0, thirdW, sheetH);
    drawFoldTickMarks(sheet1, [thirdW, thirdW * 2]);

    // Sheet 2 (Interior): p2, p3, p4
    const sheet2 = destDoc.addPage([sheetW, sheetH]);
    drawSlot(sheet2, totalSrcPages >= 2 ? 1 : -1, 0, 0, thirdW, sheetH);
    drawSlot(sheet2, totalSrcPages >= 3 ? 2 : -1, thirdW, 0, thirdW, sheetH);
    drawSlot(sheet2, totalSrcPages >= 4 ? 3 : -1, thirdW * 2, 0, thirdW, sheetH);
    drawFoldTickMarks(sheet2, [thirdW, thirdW * 2]);
  }

  return await destDoc.save();
}


