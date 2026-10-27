# PRE_DEPLOYMENT_REPORT

## Commands and results
- `npm run generate:fixtures`: PASS
- `npm run test:unit`: PASS
- `npm run test:integration`: PASS
- `npm run test:static`: PASS

## Fixture and output sizes
- Fixture file: tests/fixtures/sample.pdf (1386 bytes)
- Redacted sample output: 2832 bytes

## Verification results
- Mode: rasterized-rebuild-v1
- Terminology: Verified Destructive Redaction
- Surfaces checked: extractable-text, metadata, annotations, forms
- Heuristic checks: raw-byte-search /Annots /AcroForm

## Metadata summary
- Fixture title: Fixture PDF
- Supported metadata features: 3
- Unsupported metadata structures: 3

## Bundle sizes (where available)
- Shared core source is unbundled in this PR; no production bundle emitted.

## Known limitations
- Browser automation coverage for actual canvas/pdf.js raster rendering is deferred with a documented test seam.
- Metadata sanitization currently targets known Info dictionary fields; unsupported structures are documented.

## Git status
```
M README.md
?? extensions/
?? package-lock.json
?? package.json
?? pdf-tools/
?? scripts/
?? src/
?? tests/
```
