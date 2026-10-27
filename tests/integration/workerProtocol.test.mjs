import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { PDFDocument } from 'pdf-lib';
import { WorkerController, createWorkerMessageHandler } from '../../src/pdf-core/workerProtocol.mjs';
import { createPdfWorkerHandlers } from '../../src/pdf-core/workerActions.mjs';

const samplePath = new URL('../fixtures/sample.pdf', import.meta.url);

class FakeWorker {
  constructor(serverHandler) {
    this.serverHandler = serverHandler;
    this.onmessage = null;
  }

  postMessage(message) {
    this.serverHandler({ data: message }, (response) => {
      this.onmessage?.({ data: response });
    });
  }
}

function mockRenderer({ width, height }) {
  const png = new PNG({ width: Math.max(1, Math.floor(width || 200)), height: Math.max(1, Math.floor(height || 200)) });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 0;
    png.data[i + 1] = 0;
    png.data[i + 2] = 0;
    png.data[i + 3] = 255;
  }
  return { pngBytes: PNG.sync.write(png), width: png.width, height: png.height };
}

test('worker protocol supports request IDs and progress events', async () => {
  const server = createWorkerMessageHandler(createPdfWorkerHandlers({ renderPageToPng: mockRenderer }));

  const fakeWorker = new FakeWorker(server);
  const controller = new WorkerController(fakeWorker);

  const progresses = [];
  const result = await controller.request('ping', { x: 1 }, { onProgress: (p) => progresses.push(p.phase) });

  assert.deepEqual(progresses, ['start']);
  assert.equal(result.ok, true);
  assert.equal(result.echo.x, 1);
});

test('worker protocol runs merge split rotate metadata and redact actions', async () => {
  const sample = await readFile(samplePath);
  const server = createWorkerMessageHandler(createPdfWorkerHandlers({ renderPageToPng: mockRenderer }));
  const fakeWorker = new FakeWorker(server);
  const controller = new WorkerController(fakeWorker);

  const sampleBufferForMerge = sample.buffer.slice(sample.byteOffset, sample.byteOffset + sample.byteLength);
  const merged = await controller.request('merge', { pdfBuffers: [sampleBufferForMerge, sampleBufferForMerge.slice(0)] }, {
    transfer: [sampleBufferForMerge]
  });
  const mergedPdf = await PDFDocument.load(merged.pdfBytes);
  assert.equal(mergedPdf.getPageCount(), 6);

  const sampleBufferForSplit = sample.buffer.slice(sample.byteOffset, sample.byteOffset + sample.byteLength);
  const split = await controller.request('split', { pdfBuffer: sampleBufferForSplit, selection: '2-3' }, {
    transfer: [sampleBufferForSplit]
  });
  const splitPdf = await PDFDocument.load(split.pdfBytes);
  assert.equal(splitPdf.getPageCount(), 2);

  const sampleBufferForRotate = sample.buffer.slice(sample.byteOffset, sample.byteOffset + sample.byteLength);
  const rotated = await controller.request('rotate', { pdfBuffer: sampleBufferForRotate, rotationRequests: [{ pages: '1', degrees: 90 }] }, {
    transfer: [sampleBufferForRotate]
  });
  const rotatedPdf = await PDFDocument.load(rotated.pdfBytes);
  assert.equal(rotatedPdf.getPageCount(), 3);

  const sampleBufferForInspect = sample.buffer.slice(sample.byteOffset, sample.byteOffset + sample.byteLength);
  const metadata = await controller.request('inspectMetadata', { pdfBuffer: sampleBufferForInspect }, {
    transfer: [sampleBufferForInspect]
  });
  assert.equal(metadata.metadata.title, 'Fixture PDF');

  const sampleBufferForSanitize = sample.buffer.slice(sample.byteOffset, sample.byteOffset + sample.byteLength);
  const sanitized = await controller.request('sanitizeMetadata', { pdfBuffer: sampleBufferForSanitize }, {
    transfer: [sampleBufferForSanitize]
  });
  const sanitizedInfo = await controller.request('inspectMetadata', { pdfBuffer: sanitized.pdfBytes }, {
    transfer: [sanitized.pdfBytes]
  });
  assert.equal(sanitizedInfo.metadata.title, '');

  const sampleBufferForRedact = sample.buffer.slice(sample.byteOffset, sample.byteOffset + sample.byteLength);
  const redacted = await controller.request('redact', { pdfBuffer: sampleBufferForRedact, redactedPages: [2] }, {
    transfer: [sampleBufferForRedact]
  });
  assert.equal(redacted.verification.verified, true);
  assert.ok(Array.isArray(redacted.verification.surfacesChecked));
});
