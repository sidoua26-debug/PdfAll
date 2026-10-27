import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkerController, createWorkerMessageHandler } from '../../src/pdf-core/workerProtocol.mjs';

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

test('worker protocol supports request IDs and progress events', async () => {
  const server = createWorkerMessageHandler({
    async ping(payload, ctx) {
      ctx.progress({ phase: 'half' });
      return { value: { ok: true, payload } };
    }
  });

  const fakeWorker = new FakeWorker(server);
  const controller = new WorkerController(fakeWorker);

  const progresses = [];
  const result = await controller.request('ping', { x: 1 }, { onProgress: (p) => progresses.push(p.phase) });

  assert.deepEqual(progresses, ['half']);
  assert.equal(result.ok, true);
  assert.equal(result.payload.x, 1);
});
