import { ScanCleanerOptions } from '../types';

/**
 * Enhanced adaptive cleaner for mobile document captures & notebook scans.
 * Uses local contrast normalization to flatten shadows and highlight ink/pencil.
 */
export function cleanDocumentScan(
  sourceCanvas: HTMLCanvasElement,
  options: ScanCleanerOptions
): HTMLCanvasElement {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;

  // 1. Handle rotation first if needed
  let workingCanvas = sourceCanvas;
  if (options.rotation % 360 !== 0) {
    const rotCanvas = document.createElement('canvas');
    const rad = (options.rotation * Math.PI) / 180;
    const sin = Math.abs(Math.sin(rad));
    const cos = Math.abs(Math.cos(rad));
    rotCanvas.width = Math.floor(width * cos + height * sin);
    rotCanvas.height = Math.floor(height * cos + width * sin);
    const rCtx = rotCanvas.getContext('2d');
    if (rCtx) {
      rCtx.fillStyle = '#ffffff';
      rCtx.fillRect(0, 0, rotCanvas.width, rotCanvas.height);
      rCtx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
      rCtx.rotate(rad);
      rCtx.drawImage(sourceCanvas, -width / 2, -height / 2);
      workingCanvas = rotCanvas;
    }
  }

  const w = workingCanvas.width;
  const h = workingCanvas.height;

  const destCanvas = document.createElement('canvas');
  destCanvas.width = w;
  destCanvas.height = h;
  const ctx = destCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not get context');

  ctx.drawImage(workingCanvas, 0, 0);
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // Build grayscale representation for local background estimation
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    gray[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
  }

  // Fast box blur to approximate uneven background illumination
  // Using downsampled local mean estimation for high performance
  const step = Math.max(4, Math.floor(options.adaptiveRadius / 4));
  const smallW = Math.ceil(w / step);
  const smallH = Math.ceil(h / step);
  const smallBg = new Float32Array(smallW * smallH);

  for (let sy = 0; sy < smallH; sy++) {
    const yStart = sy * step;
    for (let sx = 0; sx < smallW; sx++) {
      const xStart = sx * step;
      let sum = 0;
      let count = 0;
      for (let dy = 0; dy < step && yStart + dy < h; dy++) {
        for (let dx = 0; dx < step && xStart + dx < w; dx++) {
          sum += gray[(yStart + dy) * w + (xStart + dx)];
          count++;
        }
      }
      smallBg[sy * smallW + sx] = count > 0 ? sum / count : 255;
    }
  }

  const contrastFactor = 1 + (options.contrast / 50);
  const brightnessOffset = options.brightness;

  for (let y = 0; y < h; y++) {
    const sy = Math.min(smallH - 1, Math.floor(y / step));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(smallW - 1, Math.floor(x / step));
      const localBg = Math.max(40, smallBg[sy * smallW + sx]);
      const pixelIdx = (y * w + x) * 4;
      
      const r = data[pixelIdx];
      const g = data[pixelIdx + 1];
      const b = data[pixelIdx + 2];
      const lum = gray[y * w + x];

      // Normalized ratio against local background illumination
      // If pixel is close to local background, it is paper -> whiten it
      const ratio = (lum / localBg);

      if (options.mode === 'crisp_bw') {
        // High contrast binarization for laser print
        const isInk = ratio < 0.82;
        const val = isInk ? 0 : 255;
        data[pixelIdx] = val;
        data[pixelIdx + 1] = val;
        data[pixelIdx + 2] = val;
      } else if (options.mode === 'pencil_boost') {
        // Boost faint pencil / ballpoint
        if (ratio > 0.88) {
          data[pixelIdx] = 255;
          data[pixelIdx + 1] = 255;
          data[pixelIdx + 2] = 255;
        } else {
          // Thicken and deepen
          const boosted = Math.max(0, Math.min(255, lum * 0.6 * contrastFactor + brightnessOffset));
          data[pixelIdx] = boosted;
          data[pixelIdx + 1] = boosted;
          data[pixelIdx + 2] = boosted;
        }
      } else {
        // 'color_clean': remove paper shadows, retain colors (highlighters, colored pens)
        if (ratio > 0.90) {
          // Flatten background to pure white
          data[pixelIdx] = 255;
          data[pixelIdx + 1] = 255;
          data[pixelIdx + 2] = 255;
        } else {
          // Enhance color stroke against white
          const scale = Math.min(1.5, 255 / localBg);
          data[pixelIdx] = Math.max(0, Math.min(255, r * scale));
          data[pixelIdx + 1] = Math.max(0, Math.min(255, g * scale));
          data[pixelIdx + 2] = Math.max(0, Math.min(255, b * scale));
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return destCanvas;
}
