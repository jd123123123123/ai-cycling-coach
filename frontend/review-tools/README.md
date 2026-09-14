# Local plan-review document readers

These dependencies are isolated from the shared application `node_modules` and are only imported by `src/review-plan/documentReader.ts`. They are not included in the application's production entry.

Install reproducibly with `npm ci --prefix review-tools --ignore-scripts` from `frontend`, then start the existing Vite development server. Open `/review-plan-profile.html`.

- Mammoth: DOCX **raw text** only; never insert converted HTML.
- PDF.js: local text extraction, no OCR. PDF JavaScript is not executed.
- 10 MB input, 30 PDF pages, 50,000 text characters; DOCX ZIP metadata preflight.
- No LLM request, file upload, plan activation, or other API mutation occurs in this prototype.
- Natural-language extraction is a deliberately limited, editable local rule-based demonstration. Production needs authenticated document processing and validated structured AI output before integration.
