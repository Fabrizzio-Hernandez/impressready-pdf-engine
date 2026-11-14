/**
 * Convert millimeters to PostScript points (1 pt = 1/72 inch, 1 inch = 25.4 mm)
 */
export function mmToPt(mm: number): number {
  return (mm * 72) / 25.4;
}

/**
 * Convert millimeters to pixels at a given DPI (default 300 DPI)
 */
export function mmToPx(mm: number, dpi: number = 300): number {
  return Math.round((mm / 25.4) * dpi);
}

/**
 * Load an image File or Blob into an HTMLImageElement
 */
export function loadImage(fileOrUrl: File | Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    if (typeof fileOrUrl === 'string') {
      if (fileOrUrl.startsWith('http')) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => resolve(img);
      img.onerror = (err) => reject(new Error('Failed to load image: ' + err));
      img.src = fileOrUrl;
    } else {
      const url = URL.createObjectURL(fileOrUrl);
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = (err) => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image: ' + err));
      };
      img.src = url;
    }
  });
}

/**
 * Trigger browser file download from Blob or Uint8Array
 */
export function downloadFile(data: Blob | Uint8Array, filename: string, mimeType: string = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data as unknown as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Triggers native browser OS print dialog for a PDF without forcing a manual file download
 */
export function printPdfDirect(data: Blob | Uint8Array) {
  const blob = data instanceof Blob ? data : new Blob([data as unknown as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.src = url;
  document.body.appendChild(iframe);

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.warn('Direct iframe print blocked, opening in new tab:', e);
      window.open(url, '_blank');
    }
    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
      URL.revokeObjectURL(url);
    }, 60000);
  };
}

/**
 * Convert Canvas to Blob as Promise
 */
export function canvasToBlob(canvas: HTMLCanvasElement, type: string = 'image/jpeg', quality: number = 0.95): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas to Blob failed'));
    }, type, quality);
  });
}

/**
 * Transforms an image canvas into True Monochrome (K=100%) or Calibrated Grayscale.
 * Neutralizes composite black (CMY) to force printers to use solely the black ink cartridge.
 */
export function processPureBlackCanvas(
  sourceCanvas: HTMLCanvasElement,
  mode: 'pure_mono' | 'calibrated_grayscale',
  contrastBoost: number = 20, // 0 to 100
  threshold: number = 160 // 0 to 255 for pure mono
): HTMLCanvasElement {
  const outCanvas = document.createElement('canvas');
  outCanvas.width = sourceCanvas.width;
  outCanvas.height = sourceCanvas.height;

  const ctx = outCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return sourceCanvas;

  ctx.drawImage(sourceCanvas, 0, 0);
  const imgData = ctx.getImageData(0, 0, outCanvas.width, outCanvas.height);
  const d = imgData.data;

  // Contrast factor calculation
  const factor = (259 * (contrastBoost + 255)) / (255 * (259 - contrastBoost));

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];

    // Standard ITU-R BT.601 perceptual luminance
    let y = 0.299 * r + 0.587 * g + 0.114 * b;

    // Apply contrast
    y = factor * (y - 128) + 128;
    y = Math.max(0, Math.min(255, y));

    if (mode === 'pure_mono') {
      // Binarize to 0 (solid black) or 255 (solid white)
      const val = y < threshold ? 0 : 255;
      d[i] = val;
      d[i + 1] = val;
      d[i + 2] = val;
    } else {
      // Calibrated Grayscale: R = G = B = y
      // Whiten subtle background noise
      const val = y > 238 ? 255 : Math.round(y);
      d[i] = val;
      d[i + 1] = val;
      d[i + 2] = val;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return outCanvas;
}

export interface PassportPhotoFilters {
  brightness: number; // -50 to 50
  contrast: number; // -50 to 50
  warmth: number; // -30 to 30
  backgroundMode: 'original' | 'pure_white' | 'light_gray' | 'light_blue';
  whitenerStrength: number; // 0 to 100
}

/**
 * Applies biometric photo laboratory filters (exposure, contrast, warmth)
 * and intelligent background whitening/neutralization for official documents.
 */
export function processPassportPhotoAdjustments(
  sourceCanvas: HTMLCanvasElement,
  filters: PassportPhotoFilters
): HTMLCanvasElement {
  const { brightness, contrast, warmth, backgroundMode, whitenerStrength } = filters;
  const outCanvas = document.createElement('canvas');
  outCanvas.width = sourceCanvas.width;
  outCanvas.height = sourceCanvas.height;

  const ctx = outCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return sourceCanvas;

  ctx.drawImage(sourceCanvas, 0, 0);
  const imgData = ctx.getImageData(0, 0, outCanvas.width, outCanvas.height);
  const d = imgData.data;

  // Contrast factor
  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const brightnessOffset = brightness * 2.55;

  // Target background color
  let targetR = 255;
  let targetG = 255;
  let targetB = 255;
  if (backgroundMode === 'light_gray') {
    targetR = 241;
    targetG = 245;
    targetB = 249;
  } else if (backgroundMode === 'light_blue') {
    targetR = 224;
    targetG = 242;
    targetB = 254;
  }

  const applyWhitener = backgroundMode !== 'original' && whitenerStrength > 0;
  const strengthRatio = whitenerStrength / 100;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];

    // 1. Brightness
    if (brightness !== 0) {
      r += brightnessOffset;
      g += brightnessOffset;
      b += brightnessOffset;
    }

    // 2. Contrast
    if (contrast !== 0) {
      r = contrastFactor * (r - 128) + 128;
      g = contrastFactor * (g - 128) + 128;
      b = contrastFactor * (b - 128) + 128;
    }

    // 3. Warmth (temperature adjustment)
    if (warmth !== 0) {
      r += warmth * 1.2;
      b -= warmth * 1.2;
    }

    // Clamp
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));

    // 4. Intelligent Background Whitener / Shadow neutralizer
    if (applyWhitener) {
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      const chromaDiff = Math.max(r, g, b) - Math.min(r, g, b);

      // Background threshold: high luminance and low chromatic saturation (walls, light shadows)
      if (luminance > 165 && chromaDiff < 45) {
        const blendFactor = Math.min(1, Math.max(0, (luminance - 165) / 50)) * strengthRatio;
        r = r * (1 - blendFactor) + targetR * blendFactor;
        g = g * (1 - blendFactor) + targetG * blendFactor;
        b = b * (1 - blendFactor) + targetB * blendFactor;
      }
    }

    d[i] = Math.round(r);
    d[i + 1] = Math.round(g);
    d[i + 2] = Math.round(b);
  }

  ctx.putImageData(imgData, 0, 0);
  return outCanvas;
}

/**
 * Safely releases canvas memory allocations and zeroes dimensions
 * to avoid memory leaks on mobile devices and low-RAM computers.
 */
export function disposeCanvas(canvas: HTMLCanvasElement | null | undefined): void {
  if (!canvas) return;
  try {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    canvas.width = 0;
    canvas.height = 0;
  } catch {
    // Suppress disposal errors
  }
}

/**
 * Calculates a safe scale factor for screen previews ensuring total pixels <= maxMegaPixels.
 */
export function calculateSafeDisplayScale(
  widthPx: number,
  heightPx: number,
  maxPixels: number = 2048 * 2048
): number {
  const totalPixels = widthPx * heightPx;
  if (totalPixels <= maxPixels) return 1.0;
  return Math.sqrt(maxPixels / totalPixels);
}

