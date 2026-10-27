import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { inspectMetadata } from './metadata.mjs';
import { createError } from './errors.mjs';

const toUint8 = (data) => {
  if (data instanceof Uint8Array) {
    return Uint8Array.from(data);
  }
  return new Uint8Array(data.slice(0));
};

export async function extractPageText(pdfBytes, pageNumber) {
  const pages = await extractPagesText(pdfBytes, [pageNumber]);
  return pages[pageNumber] ?? '';
}

export async function extractPagesText(pdfBytes, pageNumbers) {
  const loadingTask = getDocument({ data: toUint8(pdfBytes), disableWorker: true });
  const pdf = await loadingTask.promise;
  const out = {};
  for (const pageNumber of pageNumbers) {
    const page = await pdf.getPage(pageNumber);
    const text = await page.getTextContent();
    out[pageNumber] = text.items.map((item) => ('str' in item ? item.str : '')).join(' ').trim();
  }
  await loadingTask.destroy();
  return out;
}

export async function verifyRedactionOutput({ pdfBytes, redactedPages, expectedSanitizedMetadata = true }) {
  const sortedPages = [...new Set(redactedPages)].sort((a, b) => a - b);
  const pageTexts = await extractPagesText(pdfBytes, sortedPages);
  for (const page of sortedPages) {
    const text = pageTexts[page] ?? '';
    if (text.length > 0) {
      throw createError('REDACTION_VERIFICATION_TEXT', 'Redacted page still has extractable text', { page, textSnippet: text.slice(0, 80) });
    }
  }

  const metadataInfo = await inspectMetadata(pdfBytes);
  if (expectedSanitizedMetadata) {
    const values = Object.entries(metadataInfo.metadata).filter(([key]) => key !== 'pageCount').map(([, v]) => v);
    const hasUnexpected = values.some((value) => value && value !== '1970-01-01T00:00:00.000Z');
    if (hasUnexpected) {
      throw createError('REDACTION_VERIFICATION_METADATA', 'Metadata was not fully sanitized', { metadata: metadataInfo.metadata });
    }
  }

  const binaryCheck = new TextDecoder('latin1').decode(toUint8(pdfBytes));
  const hasAnnots = /\/Annots\b/.test(binaryCheck);
  const hasAcroForm = /\/AcroForm\b/.test(binaryCheck);
  if (hasAnnots || hasAcroForm) {
    throw createError('REDACTION_VERIFICATION_OBJECTS', 'Detected annotation/form structures after redaction', { hasAnnots, hasAcroForm });
  }

  return {
    verified: true,
    surfacesChecked: ['extractable-text', 'metadata', 'annotations', 'forms'],
    heuristicChecks: ['raw-byte-search /Annots /AcroForm']
  };
}
