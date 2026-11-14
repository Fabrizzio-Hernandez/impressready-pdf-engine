export interface MockPixelBuffer {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

class MockCanvas2DContext {
  private buffer: MockPixelBuffer;

  constructor(canvas: MockCanvasElement) {
    this.buffer = canvas._buffer;
  }

  drawImage(source: MockCanvasElement, dx: number, dy: number): void {
    const src = source._buffer;
    const dst = this.buffer;
    const offsetX = Math.round(dx);
    const offsetY = Math.round(dy);

    for (let y = 0; y < src.height; y++) {
      const targetY = y + offsetY;
      if (targetY < 0 || targetY >= dst.height) continue;
      for (let x = 0; x < src.width; x++) {
        const targetX = x + offsetX;
        if (targetX < 0 || targetX >= dst.width) continue;
        const srcIdx = (y * src.width + x) * 4;
        const dstIdx = (targetY * dst.width + targetX) * 4;
        dst.data[dstIdx] = src.data[srcIdx];
        dst.data[dstIdx + 1] = src.data[srcIdx + 1];
        dst.data[dstIdx + 2] = src.data[srcIdx + 2];
        dst.data[dstIdx + 3] = src.data[srcIdx + 3];
      }
    }
  }

  getImageData(sx: number, sy: number, sw: number, sh: number) {
    const out = new Uint8ClampedArray(sw * sh * 4);
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const srcIdx = ((sy + y) * this.buffer.width + (sx + x)) * 4;
        const dstIdx = (y * sw + x) * 4;
        out[dstIdx] = this.buffer.data[srcIdx] ?? 0;
        out[dstIdx + 1] = this.buffer.data[srcIdx + 1] ?? 0;
        out[dstIdx + 2] = this.buffer.data[srcIdx + 2] ?? 0;
        out[dstIdx + 3] = this.buffer.data[srcIdx + 3] ?? 255;
      }
    }
    return { width: sw, height: sh, data: out };
  }

  putImageData(imageData: { width: number; height: number; data: Uint8ClampedArray }, dx: number, dy: number): void {
    for (let y = 0; y < imageData.height; y++) {
      const targetY = y + dy;
      if (targetY < 0 || targetY >= this.buffer.height) continue;
      for (let x = 0; x < imageData.width; x++) {
        const targetX = x + dx;
        if (targetX < 0 || targetX >= this.buffer.width) continue;
        const srcIdx = (y * imageData.width + x) * 4;
        const dstIdx = (targetY * this.buffer.width + targetX) * 4;
        this.buffer.data[dstIdx] = imageData.data[srcIdx];
        this.buffer.data[dstIdx + 1] = imageData.data[srcIdx + 1];
        this.buffer.data[dstIdx + 2] = imageData.data[srcIdx + 2];
        this.buffer.data[dstIdx + 3] = imageData.data[srcIdx + 3];
      }
    }
  }

  clearRect(): void {
    this.buffer.data.fill(0);
  }
}

export class MockCanvasElement {
  private _width = 1;
  private _height = 1;
  public _buffer: MockPixelBuffer;

  constructor(width = 1, height = 1) {
    this._width = width;
    this._height = height;
    this._buffer = {
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    };
  }

  get width(): number {
    return this._width;
  }

  set width(v: number) {
    this._width = v;
    this._buffer = {
      width: v,
      height: this._height,
      data: new Uint8ClampedArray(v * this._height * 4),
    };
  }

  get height(): number {
    return this._height;
  }

  set height(v: number) {
    this._height = v;
    this._buffer = {
      width: this._width,
      height: v,
      data: new Uint8ClampedArray(this._width * v * 4),
    };
  }

  getContext(type: string) {
    if (type !== '2d') return null;
    return new MockCanvas2DContext(this);
  }
}

export function createMockCanvas(
  width: number,
  height: number,
  fillPixel?: (x: number, y: number) => [number, number, number, number]
): HTMLCanvasElement {
  const canvas = new MockCanvasElement(width, height);
  if (fillPixel) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const [r, g, b, a] = fillPixel(x, y);
        const idx = (y * width + x) * 4;
        canvas._buffer.data[idx] = r;
        canvas._buffer.data[idx + 1] = g;
        canvas._buffer.data[idx + 2] = b;
        canvas._buffer.data[idx + 3] = a;
      }
    }
  }
  return canvas as unknown as HTMLCanvasElement;
}

export function getPixelRgba(canvas: HTMLCanvasElement, x: number, y: number): [number, number, number, number] {
  const mock = canvas as unknown as MockCanvasElement;
  const idx = (y * mock.width + x) * 4;
  const d = mock._buffer.data;
  return [d[idx], d[idx + 1], d[idx + 2], d[idx + 3]];
}

export function installMockDocumentCanvas(): () => void {
  const previousDocument = (globalThis as any).document;
  (globalThis as any).document = {
    createElement(tag: string) {
      if (tag === 'canvas') {
        return new MockCanvasElement();
      }
      throw new Error(`Unsupported mocked element: ${tag}`);
    },
  };
  return () => {
    if (previousDocument === undefined) {
      delete (globalThis as any).document;
    } else {
      (globalThis as any).document = previousDocument;
    }
  };
}
