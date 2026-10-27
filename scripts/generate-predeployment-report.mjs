import { stat, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { inspectMetadata } from '../src/pdf-core/metadata.mjs';
import { verifyRedactionOutput } from '../src/pdf-core/verify.mjs';
import { redactByRasterizedRebuild } from '../src/pdf-core/redaction.mjs';
import { PNG } from 'pngjs';

const execFileAsync = promisify(execFile);

async function run(cmd, args) {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, { encoding: 'utf8' });
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout?.trim() ?? '',
      stderr: error.stderr?.trim() ?? error.message
    };
  }
}

function mockRenderer({ width, height }) {
  const png = new PNG({ width: Math.max(1, Math.floor(width)), height: Math.max(1, Math.floor(height)) });
  png.data.fill(0);
  for (let i = 3; i < png.data.length; i += 4) png.data[i] = 255;
  return { pngBytes: PNG.sync.write(png), width: png.width, height: png.height };
}

const commands = [
  ['npm', ['run', 'generate:fixtures']],
  ['npm', ['run', 'test:unit']],
  ['npm', ['run', 'test:integration']],
  ['npm', ['run', 'test:static']]
];

const commandResults = [];
for (const [cmd, args] of commands) {
  const result = await run(cmd, args);
  commandResults.push({ cmd: `${cmd} ${args.join(' ')}`, ...result });
}

const fixturePath = 'tests/fixtures/sample.pdf';
const fixtureBuffer = await readFile(fixturePath);
const fixtureMeta = await inspectMetadata(fixtureBuffer);
const redacted = await redactByRasterizedRebuild({ pdfBuffer: fixtureBuffer, redactedPages: [2], renderPageToPng: mockRenderer });
const verification = await verifyRedactionOutput({ pdfBytes: redacted.bytes, redactedPages: [2] });
const fixtureSize = (await stat(fixturePath)).size;
const redactedSize = redacted.bytes.byteLength;

const gitStatus = await run('git', ['status', '--short']);

const report = `# PRE_DEPLOYMENT_REPORT

## Commands and results
${commandResults.map((r) => `- \`${r.cmd}\`: ${r.ok ? 'PASS' : 'FAIL'}`).join('\n')}

## Fixture and output sizes
- Fixture file: ${fixturePath} (${fixtureSize} bytes)
- Redacted sample output: ${redactedSize} bytes

## Verification results
- Mode: ${redacted.mode}
- Terminology: ${redacted.terminology}
- Surfaces checked: ${verification.surfacesChecked.join(', ')}
- Heuristic checks: ${verification.heuristicChecks.join(', ')}

## Metadata summary
- Fixture title: ${fixtureMeta.metadata.title}
- Supported metadata features: ${fixtureMeta.featureMatrix.supported.length}
- Unsupported metadata structures: ${fixtureMeta.featureMatrix.unsupported.length}

## Bundle sizes (where available)
- Shared core source is unbundled in this PR; no production bundle emitted.

## Known limitations
- Browser automation coverage for actual canvas/pdf.js raster rendering is deferred with a documented test seam.
- Metadata sanitization currently targets known Info dictionary fields; unsupported structures are documented.

## Git status
\`\`\`
${gitStatus.stdout || '(clean)'}
\`\`\`
`;

await writeFile('PRE_DEPLOYMENT_REPORT.md', report, 'utf8');

if (commandResults.some((r) => !r.ok)) {
  console.error('One or more checks failed. PRE_DEPLOYMENT_REPORT.md was still generated.');
  process.exit(1);
}

console.log('Generated PRE_DEPLOYMENT_REPORT.md');
