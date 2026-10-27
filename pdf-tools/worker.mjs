import { createWorkerMessageHandler } from '../src/pdf-core/workerProtocol.mjs';

const handlers = {
  async ping(payload, ctx) {
    ctx.progress({ stage: 'start' });
    if (ctx.isCancelled()) {
      throw new Error('Cancelled');
    }
    return { value: { ok: true, echo: payload } };
  }
};

const handler = createWorkerMessageHandler(handlers);
self.onmessage = (event) => handler(event, self.postMessage.bind(self));
