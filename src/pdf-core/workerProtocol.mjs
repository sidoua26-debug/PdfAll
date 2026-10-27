import { createError } from './errors.mjs';

export class WorkerController {
  constructor(workerLike) {
    this.worker = workerLike;
    this.seq = 0;
    this.pending = new Map();
    this.abortControllers = new Map();

    this.worker.onmessage = (event) => {
      const msg = event.data;
      const entry = this.pending.get(msg.id);
      if (!entry) return;

      if (msg.type === 'progress') {
        entry.onProgress?.(msg.progress);
        return;
      }

      if (msg.type === 'result') {
        this.pending.delete(msg.id);
        this.abortControllers.delete(msg.id);
        entry.resolve(msg.result);
        return;
      }

      if (msg.type === 'error') {
        this.pending.delete(msg.id);
        this.abortControllers.delete(msg.id);
        const err = createError(msg.error.code ?? 'WORKER_ERROR', msg.error.message ?? 'Worker error', msg.error.details ?? {});
        entry.reject(err);
      }
    };
  }

  request(action, payload, { onProgress, signal, transfer = [] } = {}) {
    const id = `req-${++this.seq}`;
    return new Promise((resolve, reject) => {
      const abortController = new AbortController();
      const cleanupAbortListeners = () => {
        signal?.removeEventListener('abort', onAbort);
        abortController.signal.removeEventListener('abort', onAbort);
      };
      const onAbort = () => {
        this.worker.postMessage({ type: 'cancel', id, action: 'cancel' });
        this.pending.delete(id);
        this.abortControllers.delete(id);
        cleanupAbortListeners();
        reject(createError('CANCELLED', 'Operation cancelled'));
      };

      signal?.addEventListener('abort', onAbort, { once: true });
      abortController.signal.addEventListener('abort', onAbort, { once: true });

      this.pending.set(id, {
        resolve: (value) => {
          cleanupAbortListeners();
          resolve(value);
        },
        reject: (error) => {
          cleanupAbortListeners();
          reject(error);
        },
        onProgress
      });
      this.abortControllers.set(id, abortController);
      this.worker.postMessage({ type: 'request', id, action, payload }, transfer);
    });
  }

  cancel(id) {
    const controller = this.abortControllers.get(id);
    if (controller) controller.abort();
  }
}

export function createWorkerMessageHandler(handlers) {
  const cancellations = new Set();

  return async function onMessage(event, postMessage) {
    const msg = event.data;
    if (msg.type === 'cancel') {
      cancellations.add(msg.id);
      return;
    }

    if (msg.type !== 'request') return;
    const handler = handlers[msg.action];
    if (!handler) {
      postMessage({ type: 'error', id: msg.id, error: { code: 'UNKNOWN_ACTION', message: `No handler for action: ${msg.action}` } });
      return;
    }

    try {
      const result = await handler(msg.payload, {
        isCancelled: () => cancellations.has(msg.id),
        progress: (progress) => postMessage({ type: 'progress', id: msg.id, progress })
      });

      if (cancellations.has(msg.id)) {
        throw createError('CANCELLED', 'Operation cancelled');
      }

      const transfer = result?.transferables ?? [];
      postMessage({ type: 'result', id: msg.id, result: result?.value ?? result }, transfer);
    } catch (error) {
      postMessage({
        type: 'error',
        id: msg.id,
        error: {
          code: error.code ?? 'WORKER_EXECUTION_ERROR',
          message: error.message ?? 'Worker execution failed',
          details: error.details ?? {}
        }
      });
    } finally {
      cancellations.delete(msg.id);
    }
  };
}
