export interface PaperPreset {
  id: string;
  name: string;
  caliperMm: number; // thickness per sheet (2 pages)
  category: 'offset' | 'novel' | 'glossy';
  description: string;
}

export const PAPER_PRESETS: PaperPreset[] = [
  { id: 'offset_80', name: 'Offset Blanco 80 g/m² (Estándar fotocopia / tesis)', caliperMm: 0.100, category: 'offset', description: 'Papel blanco estándar de oficina y despachos.' },
  { id: 'offset_90', name: 'Offset Blanco 90 g/m² (Alta opacidad)', caliperMm: 0.112, category: 'offset', description: 'Mayor cuerpo, ideal para memorias y manuales de empresa.' },
  { id: 'offset_100', name: 'Offset Blanco 100 g/m² (Premium)', caliperMm: 0.125, category: 'offset', description: 'Acabado opaco y tacto robusto.' },
  { id: 'novel_80_15', name: 'Ahuesado / Crema 80 g/m² Vol. 1.5 (Novela estándar)', caliperMm: 0.120, category: 'novel', description: 'Tono marfil relajante para lectura de novelas y narrativa.' },
  { id: 'novel_90_20', name: 'Ahuesado / Crema 90 g/m² Vol. 2.0 (Alto volumen)', caliperMm: 0.180, category: 'novel', description: 'Máximo grosor y ligereza, lomo grueso para libros de bolsillo.' },
  { id: 'glossy_115', name: 'Couché / Satinado 115 g/m² (Revistas y catálogos)', caliperMm: 0.095, category: 'glossy', description: 'Papel liso estucado para ilustraciones y fotografías.' },
  { id: 'glossy_135', name: 'Couché / Satinado 135 g/m² (Libro de arte / cómic)', caliperMm: 0.110, category: 'glossy', description: 'Calidad fotográfica con brillo o semimate.' },
  { id: 'glossy_170', name: 'Couché / Satinado 170 g/m² (Álbum / lujo)', caliperMm: 0.145, category: 'glossy', description: 'Gran gramaje para libros fotográficos y anuarios.' },
];

export type BookBindingType = 'softcover' | 'hardcover';

export interface BookSpineInput {
  pageCount: number;
  paperPresetId?: string;
  customCaliperMm?: number;
  bindingType: BookBindingType;
  bookWidthMm: number;
  bookHeightMm: number;
  bleedMm?: number;
}

export interface BookSpineDimensions {
  sheetsCount: number;
  caliperMm: number;
  coreSpineMm: number;
  spineThicknessMm: number;
  hingeMm: number;
  bleedMm: number;
  totalCoverWidthMm: number;
  totalCoverHeightMm: number;
  paperPreset: PaperPreset;
}

/**
 * Computes full unwrapped book cover geometry (bleed + back + hinge + spine + hinge + front + bleed).
 * Extracted as a pure domain module from ImpressReady's interactive BookSpineCalculatorTool.
 */
export function calculateBookSpineDimensions(input: BookSpineInput): BookSpineDimensions {
  const safePageCount = Math.max(1, Math.floor(input.pageCount));
  const bleedMm = input.bleedMm ?? 3;
  const paperPreset =
    PAPER_PRESETS.find((p) => p.id === input.paperPresetId) || PAPER_PRESETS[0];
  const caliperMm =
    typeof input.customCaliperMm === 'number' && Number.isFinite(input.customCaliperMm) && input.customCaliperMm > 0
      ? input.customCaliperMm
      : paperPreset.caliperMm;

  const sheetsCount = Math.ceil(safePageCount / 2);
  const coreSpineMm = Number((sheetsCount * caliperMm).toFixed(4));
  const spineThicknessMm =
    input.bindingType === 'softcover'
      ? Math.max(3, Number((coreSpineMm + 0.6).toFixed(2)))
      : Math.max(7, Number((coreSpineMm + 1.2 + 4.0).toFixed(2)));

  const hingeMm = input.bindingType === 'hardcover' ? 8 : 0;
  const totalCoverWidthMm = Number(
    (
      bleedMm +
      input.bookWidthMm +
      hingeMm +
      spineThicknessMm +
      hingeMm +
      input.bookWidthMm +
      bleedMm
    ).toFixed(2)
  );
  const totalCoverHeightMm = Number((bleedMm + input.bookHeightMm + bleedMm).toFixed(2));

  return {
    sheetsCount,
    caliperMm,
    coreSpineMm,
    spineThicknessMm,
    hingeMm,
    bleedMm,
    totalCoverWidthMm,
    totalCoverHeightMm,
    paperPreset,
  };
}
