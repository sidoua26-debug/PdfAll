import { createError } from './errors.mjs';
import { mergePdfBuffers, rotatePdfPages, splitPdfBySelection } from './mergeSplitRotate.mjs';
import { inspectMetadata, sanitizeMetadata } from './metadata.mjs';
import { redactByRasterizedRebuild } from './redaction.mjs';

function toUint8(value, fieldName) {
  if (value instanceof Uint8Array) return Uint8Array.from(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  }
  throw createError('INVALID_INPUT', `${fieldName} must be an ArrayBuffer or Uint8Array`);
}

function toPdfResult(bytes, extra = {}) {
  const outBytes = bytes instanceof Uint8Array ? Uint8Array.from(bytes) : new Uint8Array(bytes);
  return {
    value: { pdfBytes: outBytes.buffer, ...extra },
    transferables: [outBytes.buffer]
  };
}

export function createPdfWorkerHandlers({ renderPageToPng } = {}) {
  return {
    async ping(payload, ctx) {
      ctx.progress({ stage: 'start' });
      return { value: { ok: true, echo: payload } };
    },
    async merge(payload, ctx) {
      const buffers = (payload?.pdfBuffers ?? []).map((value, index) => toUint8(value, `pdfBuffers[${index}]`));
      const bytes = await mergePdfBuffers(buffers);
      ctx.progress({ stage: 'done' });
      return toPdfResult(bytes);
    },
    async split(payload, ctx) {
      const pdfBuffer = toUint8(payload?.pdfBuffer, 'pdfBuffer');
      const bytes = await splitPdfBySelection(pdfBuffer, payload?.selection);
      ctx.progress({ stage: 'done' });
      return toPdfResult(bytes);
    },
    async rotate(payload, ctx) {
      const pdfBuffer = toUint8(payload?.pdfBuffer, 'pdfBuffer');
      const bytes = await rotatePdfPages(pdfBuffer, payload?.rotationRequests);
      ctx.progress({ stage: 'done' });
      return toPdfResult(bytes);
    },
    async inspectMetadata(payload, ctx) {
      const pdfBuffer = toUint8(payload?.pdfBuffer, 'pdfBuffer');
      const info = await inspectMetadata(pdfBuffer);
      ctx.progress({ stage: 'done' });
      return { value: info };
    },
    async sanitizeMetadata(payload, ctx) {
      const pdfBuffer = toUint8(payload?.pdfBuffer, 'pdfBuffer');
      const bytes = await sanitizeMetadata(pdfBuffer);
      ctx.progress({ stage: 'done' });
      return toPdfResult(bytes);
    },
    async renderPage(payload, ctx) {
      if (typeof renderPageToPng !== 'function') {
        throw createError('MISSING_RENDERER', 'renderPageToPng callback is required');
      }
      const pdfBuffer = toUint8(payload?.pdfBuffer, 'pdfBuffer');
      const render = await renderPageToPng({
        pdfBuffer,
        pageNumber: Number.parseInt(payload?.pageNumber, 10),
        width: Number(payload?.width),
        height: Number(payload?.height),
        scale: Number(payload?.scale)
      });
      const pngBytes = toUint8(render.pngBytes, 'pngBytes');
      ctx.progress({ stage: 'done' });
      return {
        value: { pngBytes: pngBytes.buffer, width: render.width, height: render.height, pageNumber: Number.parseInt(payload?.pageNumber, 10) },
        transferables: [pngBytes.buffer]
      };
    },
    async redact(payload, ctx) {
      if (typeof renderPageToPng !== 'function') {
        throw createError('MISSING_RENDERER', 'renderPageToPng callback is required');
      }
      const pdfBuffer = toUint8(payload?.pdfBuffer, 'pdfBuffer');
      const redactedPages = Array.isArray(payload?.redactedPages) ? payload.redactedPages : [];
      const result = await redactByRasterizedRebuild({
        pdfBuffer,
        redactedPages,
        renderPageToPng: async (args) => {
          if (ctx.isCancelled()) {
            throw createError('CANCELLED', 'Operation cancelled');
          }
          return renderPageToPng(args);
        },
        onProgress: (progress) => {
          ctx.progress(progress);
          if (ctx.isCancelled()) {
            throw createError('CANCELLED', 'Operation cancelled');
          }
        }
      });
      ctx.progress({ stage: 'verification', verified: result.verification?.verified === true });
      return toPdfResult(result.bytes, {
        verification: result.verification,
        mode: result.mode,
        terminology: result.terminology
      });
    }
  };
}
