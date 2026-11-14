import { InkSaverOptions } from '../types';

export interface ProcessResult {
  canvas: HTMLCanvasElement;
  estimatedInkSavedPercent: number;
}

/**
 * Process canvas pixels using the InkSaver algorithm.
 * Replaces dark backgrounds with pure white while preserving saturated photos and charts.
 */
export function processInkSaver(
  sourceCanvas: HTMLCanvasElement,
  options: InkSaverOptions
): ProcessResult {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  
  const destCanvas = document.createElement('canvas');
  destCanvas.width = width;
  destCanvas.height = height;
  const ctx = destCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not get destination 2d context');
  
  // Copy original onto dest
  ctx.drawImage(sourceCanvas, 0, 0);
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  
  const darkThresh = (options.darkThreshold / 100) * 255;
  const lightThresh = (options.lightThreshold / 100) * 255;
  const satThresh = options.preserveColorSaturation / 100;
  
  let originalInkCost = 0;
  let newInkCost = 0;
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    
    if (a < 10) continue; // transparent pixel
    
    // Perceived Luminance Y: 0.299*R + 0.587*G + 0.114*B
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    
    // Original ink consumption estimation: (255 - luminance) * alpha
    const originalDarkness = (255 - y) * (a / 255);
    originalInkCost += originalDarkness;
    
    // Chromatic Saturation: (max - min) / max
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    const saturation = max > 0 ? delta / max : 0;
    
    let nr = r;
    let ng = g;
    let nb = b;
    
    if (options.mode === 'text_only') {
      // Pure text binarization: anything not pure dark becomes pure white
      if (y > darkThresh) {
        // Light text on dark bg -> black
        nr = 0;
        ng = 0;
        nb = 0;
      } else {
        // Dark bg -> white
        nr = 255;
        ng = 255;
        nb = 255;
      }
    } else if (options.mode === 'aggressive') {
      // Aggressive: invert dark backgrounds, convert faint colors to monochrome
      if (y < darkThresh && saturation < satThresh * 1.5) {
        nr = 255;
        ng = 255;
        nb = 255;
      } else if (y >= darkThresh && saturation < satThresh) {
        // Invert light text on dark bg to black
        nr = 0;
        ng = 0;
        nb = 0;
      }
    } else {
      // Balanced mode (default):
      // If dark background with low saturation -> pure white
      if (y < darkThresh && saturation < satThresh) {
        nr = 255;
        ng = 255;
        nb = 255;
      }
      // If light text/lines on previously dark background -> pure black
      else if (y > lightThresh && saturation < satThresh) {
        nr = 0;
        ng = 0;
        nb = 0;
      }
      // If saturated color (photos, colored bars, graphs) -> keep original or preserve hue
    }
    
    data[i] = nr;
    data[i + 1] = ng;
    data[i + 2] = nb;
    
    const newDarkness = (255 - (0.299 * nr + 0.587 * ng + 0.114 * nb)) * (a / 255);
    newInkCost += newDarkness;
  }
  
  ctx.putImageData(imgData, 0, 0);
  
  const savedPercent = originalInkCost > 0 
    ? Math.max(0, Math.round(((originalInkCost - newInkCost) / originalInkCost) * 100))
    : 0;
    
  return {
    canvas: destCanvas,
    estimatedInkSavedPercent: savedPercent,
  };
}
