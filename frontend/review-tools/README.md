# Local plan-review dependencies

These dependencies are isolated from the shared application `node_modules`. They are imported only by review entries and are not part of the production app entry.

Reproduce with `npm ci --prefix review-tools --ignore-scripts` from `frontend`, then start the existing Vite server. Open `/review-plan-entry-export.html`.

- Mammoth: DOCX raw text; no HTML insertion.
- PDF.js: local text extraction, no OCR or PDF JavaScript execution.
- Garmin FIT SDK 21.214.0: lazy local workout encoding; files are decoded and integrity-checked in review QA.
- Document limits: 10 MB, 30 PDF pages, 50,000 characters, DOCX ZIP metadata preflight.
- GPX route export requires an actual valid route (at least two valid coordinate points). Never generate route geometry from workout intervals.
- No account synchronization, LLM call, file upload, plan activation or other API mutation occurs here. Files are local downloads requiring the target app/device's import process.
- Natural-language parsing is a limited editable rule-based demonstration. Production needs authenticated processing and validated structured output.
