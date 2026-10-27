import { PDFDocument } from 'pdf-lib';
import { enforceLimits } from './limits.mjs';
import { sanitizeMetadata } from './metadata.mjs';
import { verifyRedactionOutput } from './verify.mjs';
import { createError } from './errors.mjs';

/**
 * Verified Destructive Redaction v1: rebuild selected pages from flattened images.
 */
export async function redactByRasterizedRebuild({ pdfBuffer, redactedPages, renderPageToPng, onProgress }) {
  enforceLimits({ inputBytes: pdfBuffer.byteLength });

  if (typeof renderPageToPng !== 'function') {
    throw createError('MISSING_RENDERER', 'renderPageToPng callback is required');
  }

  const source = await PDFDocument.load(pdfBuffer);
  const pageCount = source.getPageCount();
  enforceLimits({ pageCount });

  const target = await PDFDocument.create();
  const uniquePages = [...new Set(redactedPages)].sort((a, b) => a - b);

  for (let i = 0; i < pageCount; i += 1) {
    const pageNumber = i + 1;
    const shouldRedact = uniquePages.includes(pageNumber);
    if (!shouldRedact) {
      const [copied] = await target.copyPages(source, [i]);
      target.addPage(copied);
      onProgress?.({ type: 'progress', stage: 'copy', pageNumber, totalPages: pageCount });
      continue;
    }

    const sourcePage = source.getPage(i);
    const size = sourcePage.getSize();
    const result = await renderPageToPng({
      pdfBuffer,
      pageNumber,
      width: size.width,
      height: size.height
    });

    if (!result?.pngBytes || !result.width || !result.height) {
      throw createError('RENDER_FAILURE', 'Renderer did not return a valid flattened page image', { pageNumber });
    }

    enforceLimits({ renderedPixelArea: result.width * result.height });
    const image = await target.embedPng(result.pngBytes);
    const page = target.addPage([size.width, size.height]);
    page.drawImage(image, { x: 0, y: 0, width: size.width, height: size.height });

    onProgress?.({ type: 'progress', stage: 'rasterize', pageNumber, totalPages: pageCount });
  }

  const rebuiltBytes = await target.save();
  const sanitized = await sanitizeMetadata(rebuiltBytes);

  const verification = await verifyRedactionOutput({
    pdfBytes: sanitized,
    redactedPages: uniquePages,
    expectedSanitizedMetadata: true
  }).catch((error) => {
    throw createError('REDACTION_FAIL_CLOSED', 'Verification failed; refusing to return output', { cause: error.message, code: error.code });
  });

  enforceLimits({ outputBytes: sanitized.byteLength });
  return {
    bytes: sanitized,
    verification,
    mode: 'rasterized-rebuild-v1',
    terminology: 'Verified Destructive Redaction'
  };
}
