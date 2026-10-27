import { WorkerController } from '../src/pdf-core/workerProtocol.mjs';

const tabs = [
  { tab: document.getElementById('tab-merge'), panel: document.getElementById('panel-merge') },
  { tab: document.getElementById('tab-redact'), panel: document.getElementById('panel-redact') },
  { tab: document.getElementById('tab-metadata'), panel: document.getElementById('panel-metadata') }
];

for (const item of tabs) {
  item.tab.addEventListener('click', () => {
    for (const t of tabs) {
      const selected = t === item;
      t.tab.setAttribute('aria-selected', String(selected));
      t.panel.hidden = !selected;
    }
  });
}

const statusEl = document.getElementById('status');
const worker = new Worker('./worker.mjs', { type: 'module' });
const controller = new WorkerController(worker);

controller.request('ping', { now: Date.now() }).then((result) => {
  statusEl.textContent = `Worker ready: ${JSON.stringify(result)}`;
}).catch((error) => {
  statusEl.textContent = `Worker startup error: ${error.code} ${error.message}`;
});
