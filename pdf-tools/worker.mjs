import { createWorkerMessageHandler } from '../src/pdf-core/workerProtocol.mjs';
import { createPdfWorkerHandlers } from '../src/pdf-core/workerActions.mjs';
import { renderPdfPageToPng } from '../src/pdf-core/browserRenderer.mjs';

const handlers = createPdfWorkerHandlers({
  renderPageToPng: renderPdfPageToPng
});

const handler = createWorkerMessageHandler(handlers);
self.onmessage = (event) => handler(event, self.postMessage.bind(self));
