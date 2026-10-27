import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { mergePdfBuffers, rotatePdfPages, splitPdfBySelection } from '../../src/pdf-core/mergeSplitRotate.mjs';

const samplePath = new URL('../fixtures/sample.pdf', import.meta.url);

test('splitPdfBySelection returns selected pages', async () => {
  const sample = await readFile(samplePath);
  const out = await splitPdfBySelection(sample, '2-3');
  const pdf = await PDFDocument.load(out);
  assert.equal(pdf.getPageCount(), 2);
});

test('mergePdfBuffers merges page counts deterministically', async () => {
  const sample = await readFile(samplePath);
  const out = await mergePdfBuffers([sample, sample]);
  const pdf = await PDFDocument.load(out);
  assert.equal(pdf.getPageCount(), 6);
});

test('rotatePdfPages applies right-angle rotations', async () => {
  const sample = await readFile(samplePath);
  const out = await rotatePdfPages(sample, [{ pages: '1', degrees: 180 }]);
  const pdf = await PDFDocument.load(out);
  const angle = pdf.getPage(0).getRotation().angle;
  assert.equal(angle, 180);
});
