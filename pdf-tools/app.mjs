import { WorkerController } from '../src/pdf-core/workerProtocol.mjs';

const tabs = [
  { tab: document.getElementById('tab-merge'), panel: document.getElementById('panel-merge') },
  { tab: document.getElementById('tab-redact'), panel: document.getElementById('panel-redact') },
  { tab: document.getElementById('tab-metadata'), panel: document.getElementById('panel-metadata') }
];

const statusEl = document.getElementById('status');
const sourceFileInput = document.getElementById('source-file-input');
const sourceFileNameEl = document.getElementById('source-file-name');
const dropZone = document.getElementById('drop-zone');
const mergeFilesInput = document.getElementById('merge-files-input');
const metadataOutputEl = document.getElementById('metadata-output');
const redactionPagesEl = document.getElementById('redaction-pages');
const verificationStatusEl = document.getElementById('verification-status');
const cancelCurrentBtn = document.getElementById('cancel-current');
const downloadOutputEl = document.getElementById('download-output');

const worker = new Worker('./worker.mjs', { type: 'module' });
const controller = new WorkerController(worker);

const state = {
  sourceName: null,
  sourceBytes: null,
  mergeFiles: [],
  outputUrl: null,
  outputName: 'output.pdf',
  verificationOk: false,
  activeAbortController: null
};

function setStatus(message, details = '') {
  statusEl.textContent = details ? `${message}\n${details}` : message;
}

function setVerificationStatus(message, ok = false) {
  state.verificationOk = ok;
  verificationStatusEl.textContent = message;
  downloadOutputEl.setAttribute('aria-disabled', String(!ok));
}

function setOutput(pdfBytes, name, verificationMessage, verificationOk) {
  if (state.outputUrl) {
    URL.revokeObjectURL(state.outputUrl);
  }
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  state.outputUrl = URL.createObjectURL(blob);
  state.outputName = name;
  downloadOutputEl.href = state.outputUrl;
  downloadOutputEl.download = name;
  setVerificationStatus(verificationMessage, verificationOk);
}

function formatError(error) {
  const code = error?.code ?? 'UNKNOWN_ERROR';
  const message = error?.message ?? 'Unexpected error';
  const details = error?.details ? JSON.stringify(error.details, null, 2) : '';
  return { message: `${code}: ${message}`, details };
}

async function readFileAsBytes(file) {
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
}

function requireSourcePdf() {
  if (!state.sourceBytes) {
    throw new Error('Select a source PDF first.');
  }
  return state.sourceBytes;
}

function startCancellable() {
  if (state.activeAbortController) {
    state.activeAbortController.abort();
  }
  state.activeAbortController = new AbortController();
  cancelCurrentBtn.disabled = false;
  return state.activeAbortController;
}

function endCancellable() {
  state.activeAbortController = null;
  cancelCurrentBtn.disabled = true;
}

async function runWorker(action, payload, { transfer = [], onProgress } = {}) {
  const abortController = startCancellable();
  try {
    return await controller.request(action, payload, {
      transfer,
      signal: abortController.signal,
      onProgress
    });
  } finally {
    endCancellable();
  }
}

function switchTab(selectedIndex, focusPanel = false) {
  tabs.forEach((entry, index) => {
    const isSelected = index === selectedIndex;
    entry.tab.setAttribute('aria-selected', String(isSelected));
    entry.panel.hidden = !isSelected;
    if (isSelected && focusPanel) entry.panel.focus();
  });
}

tabs.forEach((entry, index) => {
  entry.tab.addEventListener('click', () => switchTab(index, true));
  entry.tab.addEventListener('keydown', (event) => {
    const keyOrder = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
    if (!keyOrder.includes(event.key)) return;
    event.preventDefault();
    let nextIndex = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    tabs[nextIndex].tab.focus();
    switchTab(nextIndex);
  });
});

sourceFileInput.addEventListener('change', async (event) => {
  const [file] = event.target.files ?? [];
  if (!file) return;
  try {
    state.sourceBytes = await readFileAsBytes(file);
    state.sourceName = file.name;
    sourceFileNameEl.textContent = `Loaded source PDF: ${file.name} (${state.sourceBytes.byteLength} bytes)`;
    setStatus(`Loaded ${file.name}.`);
    setVerificationStatus('Verification pending.', false);
  } catch (error) {
    const formatted = formatError(error);
    setStatus('Failed to read selected file.', `${formatted.message}\n${formatted.details}`);
  }
});

function handleDropZoneActivate() {
  sourceFileInput.click();
}

dropZone.addEventListener('click', handleDropZoneActivate);
dropZone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    handleDropZoneActivate();
  }
});
dropZone.addEventListener('dragover', (event) => {
  event.preventDefault();
  dropZone.classList.add('dragging');
});
dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragging');
});
dropZone.addEventListener('drop', async (event) => {
  event.preventDefault();
  dropZone.classList.remove('dragging');
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
    setStatus('Dropped file is not a PDF.');
    return;
  }
  try {
    state.sourceBytes = await readFileAsBytes(file);
    state.sourceName = file.name;
    sourceFileNameEl.textContent = `Loaded source PDF: ${file.name} (${state.sourceBytes.byteLength} bytes)`;
    setStatus(`Loaded ${file.name} from drag-and-drop.`);
    setVerificationStatus('Verification pending.', false);
  } catch (error) {
    const formatted = formatError(error);
    setStatus('Failed to process dropped PDF.', `${formatted.message}\n${formatted.details}`);
  }
});

mergeFilesInput.addEventListener('change', async (event) => {
  const files = Array.from(event.target.files ?? []);
  state.mergeFiles = await Promise.all(files.map(async (file) => ({ name: file.name, bytes: await readFileAsBytes(file) })));
  setStatus(`Ready to merge ${state.mergeFiles.length} file(s).`);
});

document.getElementById('merge-run').addEventListener('click', async () => {
  try {
    const files = state.mergeFiles.length > 0
      ? state.mergeFiles
      : [{ name: state.sourceName ?? 'source.pdf', bytes: requireSourcePdf() }];
    const pdfBuffers = files.map((file) => file.bytes.buffer.slice(file.bytes.byteOffset, file.bytes.byteOffset + file.bytes.byteLength));
    const merged = await runWorker('merge', { pdfBuffers }, {
      transfer: [...pdfBuffers],
      onProgress: (progress) => setStatus(`Merge progress: ${JSON.stringify(progress)}`)
    });
    setOutput(merged.pdfBytes, 'merged.pdf', 'Output generated. Verification not required for merge operation.', true);
    setStatus(`Merged ${files.length} file(s) successfully.`);
  } catch (error) {
    const formatted = formatError(error);
    setStatus('Merge failed.', `${formatted.message}\n${formatted.details}`);
  }
});

document.getElementById('split-run').addEventListener('click', async () => {
  try {
    const source = requireSourcePdf();
    const pdfBuffer = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
    const selection = document.getElementById('split-selection').value;
    const result = await runWorker('split', { pdfBuffer, selection }, {
      transfer: [pdfBuffer],
      onProgress: (progress) => setStatus(`Split progress: ${JSON.stringify(progress)}`)
    });
    setOutput(result.pdfBytes, 'split.pdf', 'Output generated. Verification not required for split operation.', true);
    setStatus(`Split completed for page selection "${selection}".`);
  } catch (error) {
    const formatted = formatError(error);
    setStatus('Split failed.', `${formatted.message}\n${formatted.details}`);
  }
});

document.getElementById('rotate-run').addEventListener('click', async () => {
  try {
    const source = requireSourcePdf();
    const pdfBuffer = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
    const pages = document.getElementById('rotate-pages').value;
    const degrees = Number.parseInt(document.getElementById('rotate-degrees').value, 10);
    const rotationRequests = [{ pages, degrees }];
    const result = await runWorker('rotate', { pdfBuffer, rotationRequests }, {
      transfer: [pdfBuffer],
      onProgress: (progress) => setStatus(`Rotate progress: ${JSON.stringify(progress)}`)
    });
    setOutput(result.pdfBytes, 'rotated.pdf', 'Output generated. Verification not required for rotate operation.', true);
    setStatus(`Rotate completed for pages "${pages}" at ${degrees}°.`);
  } catch (error) {
    const formatted = formatError(error);
    setStatus('Rotate failed.', `${formatted.message}\n${formatted.details}`);
  }
});

function renderRedactionPageCard(pageNumber, pngBytes) {
  const imageBlob = new Blob([pngBytes], { type: 'image/png' });
  const imageUrl = URL.createObjectURL(imageBlob);
  const card = document.createElement('article');
  card.className = 'page-card';
  card.innerHTML = `
    <label>
      <input type="checkbox" data-page="${pageNumber}" />
      Redact page ${pageNumber}
    </label>
    <img alt="Preview for page ${pageNumber}" src="${imageUrl}" />
  `;
  redactionPagesEl.appendChild(card);
}

async function refreshRedactionPreviews() {
  try {
    const source = requireSourcePdf();
    redactionPagesEl.textContent = '';
    const inspectBuffer = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
    const metadata = await runWorker('inspectMetadata', { pdfBuffer: inspectBuffer }, { transfer: [inspectBuffer] });
    const pageCount = Number(metadata?.metadata?.pageCount ?? 0);
    if (!Number.isInteger(pageCount) || pageCount < 1) {
      throw new Error('Unable to determine page count for previews.');
    }
    setStatus(`Rendering ${pageCount} redaction preview page(s)...`);
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const renderBuffer = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
      const rendered = await runWorker('renderPage', { pdfBuffer: renderBuffer, pageNumber, scale: 0.35 }, {
        transfer: [renderBuffer],
        onProgress: (progress) => setStatus(`Preview page ${pageNumber}/${pageCount}: ${JSON.stringify(progress)}`)
      });
      renderRedactionPageCard(pageNumber, rendered.pngBytes);
    }
    setStatus(`Rendered ${pageCount} preview page(s).`);
  } catch (error) {
    const formatted = formatError(error);
    setStatus('Preview rendering failed.', `${formatted.message}\n${formatted.details}`);
  }
}

document.getElementById('redaction-refresh').addEventListener('click', refreshRedactionPreviews);

document.getElementById('redaction-run').addEventListener('click', async () => {
  try {
    const source = requireSourcePdf();
    const selectedPages = Array.from(redactionPagesEl.querySelectorAll('input[type="checkbox"]:checked'))
      .map((input) => Number.parseInt(input.dataset.page, 10))
      .filter((value) => Number.isInteger(value));
    if (selectedPages.length === 0) {
      throw new Error('Select at least one page for destructive redaction.');
    }
    const pdfBuffer = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
    const result = await runWorker('redact', { pdfBuffer, redactedPages: selectedPages }, {
      transfer: [pdfBuffer],
      onProgress: (progress) => setStatus(`Redaction progress: ${JSON.stringify(progress)}`)
    });

    const verified = result?.verification?.verified === true;
    if (!verified) {
      setVerificationStatus('Verification failed. Download disabled.', false);
      setStatus('Redaction output refused: verification did not report success.');
      return;
    }
    setOutput(
      result.pdfBytes,
      'redacted-verified.pdf',
      `Verification passed (${result.terminology}; surfaces: ${result.verification.surfacesChecked.join(', ')}).`,
      true
    );
    setStatus(`Redaction completed in ${result.mode}.`);
  } catch (error) {
    const formatted = formatError(error);
    setVerificationStatus('Verification failed or operation cancelled. Download disabled.', false);
    setStatus('Redaction failed (fail-closed).', `${formatted.message}\n${formatted.details}`);
  }
});

document.getElementById('metadata-inspect').addEventListener('click', async () => {
  try {
    const source = requireSourcePdf();
    const pdfBuffer = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
    const metadata = await runWorker('inspectMetadata', { pdfBuffer }, { transfer: [pdfBuffer] });
    metadataOutputEl.textContent = JSON.stringify(metadata, null, 2);
    setStatus('Metadata inspection completed.');
  } catch (error) {
    const formatted = formatError(error);
    setStatus('Metadata inspection failed.', `${formatted.message}\n${formatted.details}`);
  }
});

document.getElementById('metadata-sanitize').addEventListener('click', async () => {
  try {
    const source = requireSourcePdf();
    const pdfBuffer = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
    const result = await runWorker('sanitizeMetadata', { pdfBuffer }, {
      transfer: [pdfBuffer],
      onProgress: (progress) => setStatus(`Sanitize metadata progress: ${JSON.stringify(progress)}`)
    });
    setOutput(result.pdfBytes, 'metadata-sanitized.pdf', 'Metadata sanitization completed. Download enabled.', true);
    const inspectBuffer = result.pdfBytes.slice(0);
    const sanitizedInfo = await runWorker('inspectMetadata', { pdfBuffer: inspectBuffer }, { transfer: [inspectBuffer] });
    metadataOutputEl.textContent = JSON.stringify(sanitizedInfo, null, 2);
    setStatus('Metadata sanitization completed.');
  } catch (error) {
    const formatted = formatError(error);
    setStatus('Metadata sanitization failed.', `${formatted.message}\n${formatted.details}`);
  }
});

cancelCurrentBtn.addEventListener('click', () => {
  if (state.activeAbortController) {
    state.activeAbortController.abort();
    setStatus('Cancellation requested.');
  }
});

downloadOutputEl.addEventListener('click', (event) => {
  if (!state.verificationOk) {
    event.preventDefault();
    setStatus('Download blocked because verification is not successful.');
  }
});

controller.request('ping', { now: Date.now() }).then(() => {
  setStatus('Worker ready. Load a local PDF to begin.');
}).catch((error) => {
  const formatted = formatError(error);
  setStatus('Worker startup error.', `${formatted.message}\n${formatted.details}`);
});
