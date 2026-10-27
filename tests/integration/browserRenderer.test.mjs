import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderPdfPageToPng } from '../../src/pdf-core/browserRenderer.mjs';
import { redactByRasterizedRebuild } from '../../src/pdf-core/redaction.mjs';
import { extractPageText } from '../../src/pdf-core/verify.mjs';

const samplePath = new URL('../fixtures/sample.pdf', import.meta.url);

test('pdf.js browser renderer path returns PNG bytes when canvas APIs are available', async (t) => {
  if (typeof OffscreenCanvas !== 'function' && typeof document === 'undefined') {
    t.skip('No browser-compatible canvas API available in this runtime');
    return;
  }

  const sample = await readFile(samplePath);
  const rendered = await renderPdfPageToPng({ pdfBuffer: sample, pageNumber: 1, scale: 0.5 });
  assert.ok(rendered.width > 0);
  assert.ok(rendered.height > 0);
  assert.ok(rendered.pngBytes.byteLength > 0);
});

test('real renderer redaction path preserves unredacted page text when available', async (t) => {
  if (typeof OffscreenCanvas !== 'function' && typeof document === 'undefined') {
    t.skip('No browser-compatible canvas API available in this runtime');
    return;
  }

  const sample = await readFile(samplePath);
  const out = await redactByRasterizedRebuild({
    pdfBuffer: sample,
    redactedPages: [2],
    renderPageToPng: renderPdfPageToPng
  });
  const preservedText = await extractPageText(out.bytes, 1);
  assert.ok(preservedText.includes('Fixture Page 1 Portrait'));
  assert.equal(out.verification.verified, true);
});
