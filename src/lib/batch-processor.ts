import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { downloadFile } from './canvas-utils';

export interface BatchItem {
  id: string;
  file: File;
  status: 'pending' | 'processing' | 'done' | 'error';
  progress: number;
  outputName?: string;
  outputData?: Uint8Array | Blob;
  error?: string;
}

export interface BatchProcessOptions {
  maxConcurrent?: number;
  onItemProgress?: (item: BatchItem, overallIndex: number, total: number) => void;
  onOverallProgress?: (percent: number) => void;
}

/**
 * Creates and triggers a download of a ZIP file containing multiple generated outputs
 */
export async function downloadBatchAsZip(
  items: { name: string; data: Uint8Array | Blob }[],
  zipFilename: string = 'impressready-lote.zip'
): Promise<void> {
  const zip = new JSZip();

  for (const item of items) {
    zip.file(item.name, item.data);
  }

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  downloadFile(zipBlob, zipFilename, 'application/zip');
}

/**
 * Merges multiple single/multi-page PDF Uint8Array buffers into a single combined PDF
 */
export async function mergePdfsIntoSingleDocument(
  pdfBuffers: Uint8Array[]
): Promise<Uint8Array> {
  const mergedDoc = await PDFDocument.create();

  for (const buffer of pdfBuffers) {
    try {
      const sourceDoc = await PDFDocument.load(buffer);
      const pageIndices = sourceDoc.getPageIndices();
      const copiedPages = await mergedDoc.copyPages(sourceDoc, pageIndices);
      copiedPages.forEach((page) => mergedDoc.addPage(page));
    } catch (err) {
      console.warn('Could not merge one of the batch PDF documents:', err);
    }
  }

  return await mergedDoc.save();
}

/**
 * Execute batch task with concurrency control and progress tracking
 */
export async function executeBatchProcessor<T>(
  files: File[],
  processSingle: (file: File, index: number) => Promise<{ name: string; data: Uint8Array | Blob }>,
  options: BatchProcessOptions = {}
): Promise<{ name: string; data: Uint8Array | Blob }[]> {
  const { onItemProgress, onOverallProgress } = options;
  const total = files.length;
  const results: { name: string; data: Uint8Array | Blob }[] = [];

  for (let i = 0; i < total; i++) {
    const file = files[i];
    const item: BatchItem = {
      id: `${file.name}-${i}-${Date.now()}`,
      file,
      status: 'processing',
      progress: 0
    };

    onItemProgress?.(item, i, total);

    try {
      const output = await processSingle(file, i);
      results.push(output);
      item.status = 'done';
      item.progress = 100;
      item.outputName = output.name;
      item.outputData = output.data;
    } catch (err: any) {
      console.error(`Error processing batch file "${file.name}":`, err);
      item.status = 'error';
      item.error = err?.message || 'Error desconocido';
    }

    onItemProgress?.(item, i, total);
    onOverallProgress?.(Math.round(((i + 1) / total) * 100));
  }

  return results;
}
