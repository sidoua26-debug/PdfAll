import { getDocument } from '../../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import { createError } from './errors.mjs';

function toUint8(data) {
  if (data instanceof Uint8Array) return Uint8Array.from(data);
  if (data instanceof ArrayBuffer) return new Uint8Array(data.slice(0));
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  }
  throw createError('INVALID_BUFFER', 'Expected PDF data as ArrayBuffer or Uint8Array');
}

function createCanvas(width, height) {
  if (typeof OffscreenCanvas === 'function') {
    return new OffscreenCanvas(width, height);
  }
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  throw createError('CANVAS_UNAVAILABLE', 'No compatible canvas implementation is available in this environment');
}

async function canvasToPngBytes(canvas) {
  if (typeof canvas.convertToBlob === 'function') {
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return new Uint8Array(await blob.arrayBuffer());
  }
  if (typeof canvas.toBlob === 'function') {
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((value) => (value ? resolve(value) : reject(createError('PNG_ENCODE_FAILED', 'Canvas toBlob returned null'))), 'image/png');
    });
    return new Uint8Array(await blob.arrayBuffer());
  }
  throw createError('PNG_ENCODE_UNAVAILABLE', 'No PNG encoding method available for canvas');
}

export async function renderPdfPageToPng({ pdfBuffer, pageNumber, width, height, scale = 1 }) {
  const loadingTask = getDocument({
    data: toUint8(pdfBuffer),
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: false
  });

  try {
    const pdf = await loadingTask.promise;
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pdf.numPages) {
      throw createError('INVALID_PAGE_NUMBER', 'Page number is out of range', { pageNumber, maxPages: pdf.numPages });
    }

    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const derivedScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    const widthScale = Number.isFinite(width) && width > 0 ? width / baseViewport.width : 1;
    const heightScale = Number.isFinite(height) && height > 0 ? height / baseViewport.height : 1;
    const renderScale = Math.max(0.1, Math.min(derivedScale * Math.min(widthScale, heightScale), 4));
    const viewport = page.getViewport({ scale: renderScale });

    const canvas = createCanvas(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      throw createError('CANVAS_CONTEXT_UNAVAILABLE', 'Unable to acquire 2D canvas context');
    }

    await page.render({ canvasContext: context, viewport }).promise;
    const pngBytes = await canvasToPngBytes(canvas);
    return { pngBytes, width: canvas.width, height: canvas.height };
  } finally {
    await loadingTask.destroy();
  }
}
