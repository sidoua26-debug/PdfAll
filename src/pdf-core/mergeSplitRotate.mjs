import { PDFDocument, degrees } from 'pdf-lib';
import { createError } from './errors.mjs';
import { enforceLimits } from './limits.mjs';
import { normalizePageSelection } from './pageRanges.mjs';

function ensureBuffers(buffers) {
  if (!Array.isArray(buffers) || buffers.length === 0) {
    throw createError('INVALID_INPUT', 'At least one PDF buffer is required', { buffers: typeof buffers });
  }
}

export async function mergePdfBuffers(pdfBuffers) {
  ensureBuffers(pdfBuffers);
  const out = await PDFDocument.create();
  let totalPages = 0;

  for (const buf of pdfBuffers) {
    enforceLimits({ inputBytes: buf.byteLength });
    const src = await PDFDocument.load(buf);
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const page of pages) out.addPage(page);
    totalPages += pages.length;
    enforceLimits({ pageCount: totalPages });
  }

  const bytes = await out.save();
  enforceLimits({ outputBytes: bytes.byteLength });
  return bytes;
}

export async function splitPdfBySelection(pdfBuffer, selection) {
  enforceLimits({ inputBytes: pdfBuffer.byteLength });
  const src = await PDFDocument.load(pdfBuffer);
  const maxPage = src.getPageCount();
  enforceLimits({ pageCount: maxPage });

  const pages = normalizePageSelection(selection, maxPage);
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, pages.map((p) => p - 1));
  copied.forEach((page) => out.addPage(page));

  const bytes = await out.save();
  enforceLimits({ outputBytes: bytes.byteLength });
  return bytes;
}

export async function rotatePdfPages(pdfBuffer, rotationRequests) {
  enforceLimits({ inputBytes: pdfBuffer.byteLength });
  const src = await PDFDocument.load(pdfBuffer);
  const count = src.getPageCount();
  enforceLimits({ pageCount: count });

  if (!Array.isArray(rotationRequests) || rotationRequests.length === 0) {
    throw createError('INVALID_ROTATION_REQUESTS', 'rotationRequests must contain at least one request');
  }

  for (const req of rotationRequests) {
    const pages = normalizePageSelection(req.pages, count);
    const angle = Number.parseInt(req.degrees, 10);
    if (![0, 90, 180, 270].includes(((angle % 360) + 360) % 360)) {
      throw createError('INVALID_ROTATION_DEGREES', 'Rotation degrees must be one of 0, 90, 180, 270', { req });
    }
    for (const pageNumber of pages) {
      src.getPage(pageNumber - 1).setRotation(degrees(((angle % 360) + 360) % 360));
    }
  }

  const bytes = await src.save();
  enforceLimits({ outputBytes: bytes.byteLength });
  return bytes;
}
