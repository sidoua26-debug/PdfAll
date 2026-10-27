import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const manifestPath = new URL('../../extensions/pdf-studio/manifest.json', import.meta.url);
const studioPath = new URL('../../extensions/pdf-studio/studio.html', import.meta.url);

test('mv3 manifest keeps zero permission policy and action opening shell', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, []);
  assert.deepEqual(manifest.host_permissions, []);
  assert.equal(manifest.background.service_worker, 'background.js');
  assert.equal(manifest.action.default_title, 'Offline PDF Studio');
});

test('mv3 studio UI is wired to local app entry', async () => {
  const studioHtml = await readFile(studioPath, 'utf8');
  assert.match(studioHtml, /<iframe[^>]+src="\.\.\/\.\.\/pdf-tools\/index\.html"/);
  assert.doesNotMatch(studioHtml, /placeholder/i);
});
