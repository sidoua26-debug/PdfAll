# PdfAll - Offline PDF Studio (Initial PR)

Offline PDF Studio bootstrap with a shared local-only PDF core, web demo shell, and zero-permission MV3 scaffold.

## Structure

- `src/pdf-core/`: shared merge/split/rotate, metadata, redaction, verification, worker protocol, and limits.
- `pdf-tools/`: local demo page with accessible tabs/placeholders.
- `extensions/pdf-studio/`: MV3 scaffold (`permissions: []`, `host_permissions: []`) opening `studio.html`.
- `tests/`: unit, integration, static scan, and deterministic fixture generation.

## Local development

```bash
npm install
npm run test
npm run report:predeploy
```

No deployment/push commands are included in scripts.

## Supported PDF features (v1)

- Merge multiple PDFs.
- Split by explicit page selection/ranges.
- Rotate selected pages in right angles (0/90/180/270).
- Metadata inspection and sanitization for known Info dictionary fields.
- **Verified Destructive Redaction** (v1 mode): rasterized rebuild of selected redacted pages, then fail-closed verification.

## Redaction guarantees and limits

- Redacted pages are rebuilt from flattened images and must not retain original page text.
- Verification re-opens output and checks extractable text on redacted pages, metadata sanitization, and annotation/form leakage surfaces.
- Raw-byte search is only a heuristic supplement.
- If destructive conversion or verification fails, output is refused (fail closed).

## Operational limits

- Input size: 25 MB max.
- Page count: 200 max.
- Rendered pixel area per redacted page: 40,000,000 max.
- Output size: 50 MB max.

## Metadata support matrix

Documented in `src/pdf-core/metadata.mjs`:

- Supported: known Info dictionary fields via `pdf-lib`.
- Unsupported (explicit): full object-graph scrubbing, embedded/custom XMP stream rewriting, incremental chain forensic cleanup.

## Browser/integration testing note

Node tests cover core logic and worker protocol. Browser automation for full canvas/pdf.js redaction rendering is not yet wired in this PR; the `renderPageToPng` seam is the explicit TODO integration point.
