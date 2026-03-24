import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { minify } from 'terser';

const repoRoot = path.resolve(process.cwd());
const frameworkPath = path.join(repoRoot, 'framework.js');
const queriesDir = path.join(repoRoot, 'templates', 'queries');
const linksDir = path.join(repoRoot, 'templates', 'links');
const outputPath = path.join(repoRoot, 'usefulQueries.js');
const minifiedPath = path.join(repoRoot, 'minified_version.js');

/**
 * Read all JSON files from a directory and return parsed objects sorted by filename.
 */
async function loadTemplates(dir) {
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const jsonFiles = entries.filter(f => f.endsWith('.json')).sort();
  const templates = [];
  for (const file of jsonFiles) {
    const content = await readFile(path.join(dir, file), 'utf8');
    templates.push(JSON.parse(content));
  }
  return templates;
}

/**
 * Format a single template object as a JS object literal string (indented for readability).
 * SPARQL templates use backtick template literals for multiline strings.
 */
function formatTemplateEntry(obj, indent) {
  const lines = [];
  lines.push(`${indent}{`);

  for (const [key, value] of Object.entries(obj)) {
    if (key === 'template') {
      // Use backtick template literal for multiline SPARQL
      const backtickContent = value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
      lines.push(`${indent}  ${key}: \`${backtickContent}\`,`);
    } else {
      lines.push(`${indent}  ${key}: ${JSON.stringify(value)},`);
    }
  }

  lines.push(`${indent}}`);
  return lines.join('\n');
}

/**
 * Format an array of template objects as a JS array body (entries only, no brackets).
 */
function formatTemplateArray(templates, indent) {
  return templates
    .map((t, i) => {
      const entry = formatTemplateEntry(t, indent);
      return i < templates.length - 1 ? entry + ',' : entry + ',';
    })
    .join('\n');
}

// Load framework and templates
const framework = await readFile(frameworkPath, 'utf8');
const queries = await loadTemplates(queriesDir);
const links = await loadTemplates(linksDir);

console.log(`[assemble] Loaded ${queries.length} query template(s) and ${links.length} link template(s)`);

// Build the formatted template arrays
const queriesBlock = formatTemplateArray(queries, '    ');
const linksBlock = formatTemplateArray(links, '    ');

// Inject templates into framework
let assembled = framework.replace(
  '    /* __USEFUL_QUERIES__ */',
  queriesBlock,
);
assembled = assembled.replace(
  '    /* __USEFUL_LINKS__ */',
  linksBlock,
);

// Write the assembled output
await writeFile(outputPath, assembled, 'utf8');
console.log(`[assemble] Wrote ${path.relative(repoRoot, outputPath)}`);

// Minify
let header = '';
let code = assembled;
if (assembled.startsWith('/*')) {
  const endIndex = assembled.indexOf('*/');
  if (endIndex !== -1) {
    header = assembled.slice(0, endIndex + 2).trimEnd() + '\n';
    code = assembled.slice(endIndex + 2);
  }
}

const result = await minify(code, {
  compress: true,
  mangle: true,
  ecma: 2020,
  format: {
    ascii_only: true,
  },
});

if (!result.code) {
  throw new Error('Terser did not produce output.');
}

await writeFile(minifiedPath, header + result.code + '\n', 'utf8');
console.log(`[assemble] Wrote ${path.relative(repoRoot, minifiedPath)}`);
