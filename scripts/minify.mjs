import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { minify } from 'terser';

const repoRoot = path.resolve(process.cwd());
const inputPath = path.join(repoRoot, 'usefulQueries.js');
const outputPath = path.join(repoRoot, 'minified_version.js');

const source = await readFile(inputPath, 'utf8');

// Preserve the leading block comment header (if present) so the minified file
// still contains the usage / attribution notes.
let header = '';
let code = source;
if (source.startsWith('/*')) {
  const endIndex = source.indexOf('*/');
  if (endIndex !== -1) {
    header = source.slice(0, endIndex + 2).trimEnd() + '\n';
    code = source.slice(endIndex + 2);
  }
}

const result = await minify(code, {
  compress: true,
  mangle: true,
  ecma: 2020,
  format: {
    // Userscripts can be sensitive to stray inline HTML comments.
    ascii_only: true,
  },
});

if (!result.code) {
  throw new Error('Terser did not produce output.');
}

await writeFile(outputPath, header + result.code + '\n', 'utf8');
console.log(`[usefulQueries] Wrote ${path.relative(repoRoot, outputPath)}`);
