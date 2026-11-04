// Copies the pdf.js worker into /public so it is served from the same origin.
import { copyFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const src = path.join(path.dirname(require.resolve("pdfjs-dist/package.json")), "build", "pdf.worker.min.mjs");
copyFileSync(src, new URL("../public/pdf.worker.min.mjs", import.meta.url));
