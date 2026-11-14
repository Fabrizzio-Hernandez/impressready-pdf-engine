export type Language = 'es' | 'en' | 'de' | 'fr' | 'pt' | 'it';

export type ToolId = 
  | 'passport-photo'
  | 'poster-tiling'
  | 'booklet'
  | 'ink-saver'
  | 'scan-cleaner'
  | 'printable-templates'
  | 'n-up'
  | 'shipping-label'
  | 'duplex-assistant'
  | 'business-cards'
  | 'flashcards'
  | 'scale-calibrator'
  | 'gutter-margin'
  | 'smart-crop'
  | 'auto-rotate'
  | 'reverse-order'
  | 'print-stamp'
  | 'color-splitter'
  | 'ink-coverage'
  | 'pure-black'
  | 'binder-spine'
  | 'brochure-fold'
  | 'id-copy'
  | 'blank-remover'
  | 'dark-slide-inverter'
  | 'envelope-print'
  | 'sign-pdf'
  | 'compress-pdf'
  | 'photos-to-pdf'
  | 'unlock-pdf'
  | 'page-numbering'
  | 'merge-split-pdf'
  | 'book-spine-calculator'
  | 'organize-pdf'
  | 'page-resizer'
  | 'pdf-to-grayscale'
  | 'pdf-to-jpg'
  | 'pdf-to-text'
  | 'watermark-pdf'
  | 'protect-pdf'
  | 'redact-pdf';

export interface ToolMetadata {
  id: ToolId;
  slug: string;
  icon: string;
  badge?: string;
  category: 'photo' | 'poster' | 'document' | 'template';
  estimatedMinutesSaved: number;
}

export type PassportRegion = 'all' | 'europe' | 'americas' | 'asia_world' | 'custom';

export interface PassportStandard {
  id: string;
  country: string;
  label: string;
  flag: string;
  widthMm: number;
  heightMm: number;
  photosPerSheet: number;
  guideType: 'standard' | 'us' | 'schengen' | 'spain' | 'canada' | 'square';
  description: string;
  region?: 'europe' | 'americas' | 'asia_world' | 'custom';
}

export interface TilingConfig {
  rows: number;
  cols: number;
  overlapMm: number;
  showCropMarks: boolean;
  showLabels: boolean;
  orientation: 'portrait' | 'landscape';
}

export type InkSaverMode = 'balanced' | 'aggressive' | 'text_only';

export interface InkSaverOptions {
  mode: InkSaverMode;
  darkThreshold: number; // 0 - 100
  lightThreshold: number; // 0 - 100
  preserveColorSaturation: number; // 0 - 100
  flattenBackgroundToWhite: boolean;
}

export interface ScanCleanerOptions {
  mode: 'color_clean' | 'crisp_bw' | 'pencil_boost';
  brightness: number; // -50 to 50
  contrast: number; // 0 to 100
  rotation: number; // 0, 90, 180, 270 or custom angle
  adaptiveRadius: number; // local window size for background
}

export type TemplateType = 
  | 'graph' 
  | 'dotgrid' 
  | 'music' 
  | 'handwriting' 
  | 'planner'
  | 'cornell'
  | 'lined'
  | 'isometric'
  | 'hexagonal'
  | 'storyboard'
  | 'wireframe'
  | 'habittracker'
  | 'dailyplanner'
  | 'calligraphy';

export interface TemplateConfig {
  type: TemplateType;
  // Graph paper
  gridSpacingMm?: number; // 1, 5, 10
  gridColor?: string;
  majorLineEvery?: number;
  // Dot grid
  dotSpacingMm?: number; // 5mm default
  dotRadiusMm?: number;
  dotColor?: string;
  // Music
  stavesCount?: number; // 6 to 12
  clef?: 'treble' | 'bass' | 'grand' | 'blank';
  // Handwriting
  rulingType?: 'montessori' | 'seyes' | 'grid4x4' | 'double_line';
  // Planner
  plannerType?: 'weekly' | 'daily_hours' | 'checklist';
}

export interface NUpConfig {
  pagesPerSheet: 2 | 3 | 4 | 6 | 8 | 9;
  orientation: 'portrait' | 'landscape';
  drawBorders: boolean;
  drawCutGuides: boolean;
  removeMargins: boolean;
  mode?: 'grid' | 'handout_3up';
  notesLinesCount?: number;
}

export type ShippingCarrierPreset = 
  | 'auto'            // Detección automática de área impresa
  | 'vinted_inpost'   // Vinted / InPost / Mondial Relay
  | 'amazon_return'   // Amazon Devolución (etiqueta y autorización)
  | 'correos_packlink'// Correos, SEUR, GLS, CTT, DHL
  | 'custom';

export type ShippingLabelLayout = 
  | 'single_a4' 
  | '2_up_a4' 
  | '4_up_a4' 
  | '8_up_a4'
  | 'thermal_4x6' 
  | 'thermal_4x4';

export interface ShippingLabelConfig {
  carrier: ShippingCarrierPreset;
  layout: ShippingLabelLayout;
  rotation: 0 | 90 | 180 | 270;
  cropBox?: { x: number; y: number; width: number; height: number };
  drawCutLines: boolean;
}

export interface DuplexCalibrationConfig {
  faceOrientation: 'face_up' | 'face_down';
  arrowDirection: 'head_first' | 'tail_first';
  reverseEvenOrder: boolean;
}

export type CardTemplateType = 
  | 'eu_business_cards' // 85 x 55 mm (10 per A4)
  | 'us_business_cards' // 89 x 51 mm (3.5 x 2", 10 per A4)
  | 'square_card_55'    // 55 x 55 mm (12 per A4)
  | 'avery_shipping'    // 70 x 37 mm (24 per A4 - Apli L7160)
  | 'avery_medium'      // 105 x 74 mm (8 per A4)
  | 'jar_labels_rect'   // 80 x 45 mm (8 per A4 - Tarros, velas, artesanía)
  | 'thank_you_card'    // 90 x 50 mm (10 per A4 - Tarjetas de agradecimiento e-commerce)
  | 'circle_40mm'       // 40 mm diameter (24 per A4)
  | 'circle_50mm';      // 50 mm diameter (15 per A4)

export interface BusinessCardConfig {
  template: CardTemplateType;
  copiesCount: number;
  drawCutGuides: boolean;
  bleedMm: number;
  isDuplex: boolean;
  qrContent?: string;
  qrPosition?: 'none' | 'bottom_right' | 'center' | 'back_full';
}

export interface FlashcardPair {
  id: string;
  front: string;
  back: string;
}

export type FlashcardMode = 'custom_text' | 'blank_ruled' | 'blank_grid';

export interface FlashcardConfig {
  layout: '2x2' | '2x3' | '2x4';
  mirrorBackColumns: boolean;
  drawCutLines: boolean;
  showCardNumbers: boolean;
  mode?: FlashcardMode;
  blankSheetsCount?: number;
}

export interface ScaleCalibratorConfig {
  calibrationSquareMm: number; // 50mm = 5cm
  testRulerMm: number; // 100mm = 10cm
  customScaleFactor: number; // 100% default
  embeddedWarningBanner: boolean;
}

export interface GutterMarginConfig {
  marginMm: number; // 5 - 35 mm
  position: 'left' | 'right' | 'top';
  duplexAlternating: boolean; // Shift odd right, even left
  punchHolesGuide: 'none' | 'spiral' | '2_holes' | '4_holes';
  scaleToFit: boolean;
}

export interface SmartCropConfig {
  sensitivity: number; // 0 - 100 (white detection threshold)
  paddingMm: number; // 0 - 20 mm safety margin
  fillPage: boolean; // scale to 95% of target sheet
  targetSize: 'keep' | 'a4' | 'letter';
}

export interface AutoRotateConfig {
  targetOrientation: 'portrait' | 'landscape' | 'uniform';
}

export interface ReverseOrderConfig {
  reverseMode: 'all' | 'even_odd_split';
}

export interface PrintStampConfig {
  preset: 'draft' | 'confidential' | 'copy' | 'exam' | 'paid' | 'custom';
  customText: string;
  style: 'outline' | 'tint'; // Outline saves 90% toner; tint uses ultra-light opacity
  opacity: number; // 0.05 to 0.40
  color: string;
  position: 'diagonal' | 'header' | 'footer';
  fontSize: number;
  pages: 'all' | 'first' | 'exclude_first';
}

export type SubscriptionPlan = 'free' | 'pro' | 'business';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  isPro: boolean;
  plan?: SubscriptionPlan;
  businessLicenseKey?: string;
  businessSeatsCount?: number;
  emailVerified?: boolean;
  createdAt: string;
  provider: 'email' | 'google';
}

export interface LoginCredentials {
  email: string;
  password?: string;
}

export interface RegisterCredentials {
  name: string;
  email: string;
  password?: string;
}

export interface PageColorAnalysis {
  pageNum: number; // 1-based index
  isColor: boolean;
  colorPixelCount: number;
  totalPixelsSampled: number;
  chromaPercentage: number;
  thumbnailUrl?: string;
}

export interface ColorSplitterRates {
  priceColorPerPage: number;
  priceBwPerPage: number;
}

export interface PageInkCoverage {
  pageNum: number;
  coveragePct: number; // 0% to 100%
  costEstimateEur: number;
  isHeavy: boolean; // coverage > 20%
  thumbnailUrl?: string;
}

export interface InkCoverageSummary {
  avgCoveragePct: number;
  totalCostEstimateEur: number;
  heavyPagesCount: number;
  pages: PageInkCoverage[];
}

export interface PureBlackConfig {
  mode: 'pure_mono' | 'calibrated_grayscale';
  contrastBoost: number; // 0 to 100
  threshold: number; // 0 to 255 for pure mono
  invertBackground: boolean;
}

export type BinderSpinePreset = 
  | 'lever_wide_80'   // 75mm - 80mm x 190mm (Standard lever-arch wide)
  | 'lever_std_50'    // 50mm x 190mm (Standard lever-arch medium)
  | 'ring_narrow_35'  // 35mm x 297mm (Narrow ring binder full height)
  | 'ring_slim_25'    // 25mm x 297mm (Slim presentation folder)
  | 'custom';

export interface BinderSpineConfig {
  preset: BinderSpinePreset;
  widthMm: number;
  heightMm: number;
  colorBand: string; // Hex color code
  colorBandHeightMm: number;
  category: string;
  title: string;
  subtitle: string;
  volumeNumber: string;
  hasThumbHole: boolean;
  thumbHoleDistMm: number;
  includeLines: boolean;
  textOrientation: 'vertical' | 'horizontal';
  quantityPerPage: number;
}

export interface BrochureFoldConfig {
  foldType: 'bifold' | 'trifold_c' | 'trifold_z';
  paperSize: 'a4_landscape' | 'a3_landscape';
  includeFoldMarks: boolean;
  includeFoldLines: boolean;
  marginMm: number;
}

export interface IdCopyConfig {
  scaleMode: '100' | '120' | '150';
  layout: 'vertical_stack' | 'horizontal_side_by_side' | 'four_copies';
  colorMode: 'color' | 'grayscale' | 'photocopy_bw';
  hasWatermark: boolean;
  watermarkText: string;
  watermarkOpacity: number;
  includeDate: boolean;
}

export interface BlankRemoverConfig {
  thresholdPercentage: number;
  removePages: number[];
}

export interface DarkSlideInverterConfig {
  threshold: number;
  preserveImages: boolean;
  enhanceTextContrast: boolean;
}

export type EnvelopeFormat = 'dl_standard' | 'dl_window' | 'c5' | 'c6' | 'c4' | 'square_155';

export interface EnvelopePrintConfig {
  format: EnvelopeFormat;
  senderName: string;
  senderCompany: string;
  senderAddress: string;
  senderCityZip: string;
  senderCountry: string;
  recipientName: string;
  recipientCompany: string;
  recipientAddress: string;
  recipientCityZip: string;
  recipientCountry: string;
  includeStampBox: boolean;
  stampType: 'standard_box' | 'urgent' | 'certified' | 'franqueo_pagado';
}


