import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { minify } from "terser";
import { assertTemplatesValid } from "./validate-templates.mjs";
import { updateWikiPage } from "./generate-wiki.mjs";

const repoRoot = path.resolve(process.cwd());
const frameworkPath = path.join(repoRoot, "framework.js");
const srcDir = path.join(repoRoot, "src");

// --profile <Name> switches settings, templates and output into a named subfolder
const profileIdx = process.argv.indexOf("--profile");
const profileName = profileIdx !== -1 ? process.argv[profileIdx + 1] : null;

// Every build lives in one folder and names its outputs after one base name:
//   usefulQueries.js          minified_usefulQueries.js          usefulQueries.wiki
//   Name/Name_usefulQueries.js  Name/minified_Name_usefulQueries.js  Name/Name_usefulQueries.wiki
// The only other difference is where the default build keeps its settings.
const buildDir = profileName ? path.join(repoRoot, profileName) : repoRoot;
const baseName = profileName ? `${profileName}_usefulQueries` : "usefulQueries";

const settingsPath = profileName
  ? path.join(buildDir, "settings.json")
  : path.join(srcDir, "settings.json");
const queriesDir = path.join(buildDir, "templates", "queries");
const linksDir = path.join(buildDir, "templates", "links");
const outputPath = path.join(buildDir, `${baseName}.js`);
const minifiedPath = path.join(buildDir, `minified_${baseName}.js`);
const wikiPath = path.join(buildDir, `${baseName}.wiki`);

// Source files to include, in dependency order. "<shared>" marks where the
// shared ES modules below are inlined.
const SRC_FILES = [
  "helpers.js",
  "<shared>",
  "qlever.js",
  "ui.js",
  "dom.js",
  "processing.js",
  "config.js",
  "editor.js",
  "settings-page.js",
  "main.js",
];

// ES modules shared between the build/tests and the shipped script. They are
// inlined with their import/export keywords stripped; keep their top-level
// names distinct from the src/ files.
const SHARED_MODULES = [
  "scripts/check-sparql.mjs",
  "scripts/validate-templates.mjs",
  "src/shared/user-config.mjs",
];

/**
 * Turn an ES module into a plain script fragment for the IIFE.
 * @param {string} code
 */
function inlineModule(code) {
  return code
    .replace(/^import\s[^;]*;\s*$/gm, "")
    .replace(/^export\s+(?=(async\s+)?function|const|let|class)/gm, "");
}

/**
 * Read all JSON files from a directory, validate them, and return the parsed
 * objects sorted by filename. Throws if any file is malformed or invalid.
 * @param {string} dir - Directory to read
 * @param {"query"|"link"} kind - Which template schema to validate against
 */
async function loadTemplates(dir, kind) {
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const jsonFiles = entries.filter((f) => f.endsWith(".json")).sort();
  const loaded = [];
  for (const file of jsonFiles) {
    const content = await readFile(path.join(dir, file), "utf8");
    let data;
    try {
      data = JSON.parse(content);
    } catch (err) {
      throw new Error(
        `${path.relative(repoRoot, path.join(dir, file))} is not valid JSON: ${err.message}`,
      );
    }
    loaded.push({ file, data });
  }

  assertTemplatesValid(loaded, kind, path.relative(repoRoot, dir));
  return loaded.map(({ data }) => data);
}

// Authoring-only fields: kept in the JSON for humans, dropped from the shipped
// script because nothing reads them at runtime. (`example` used to be one; the
// settings page now links to it.)
const BUILD_ONLY_FIELDS = [];

/**
 * Format a single template object as a JS object literal string (indented for readability).
 * SPARQL templates use backtick template literals for multiline strings.
 */
function formatTemplateEntry(obj, indent) {
  const lines = [];
  lines.push(`${indent}{`);

  for (const [key, value] of Object.entries(obj)) {
    if (BUILD_ONLY_FIELDS.includes(key)) {
      continue;
    }
    if (key === "template") {
      // "template" must be an array of lines, joined with \n at build time.
      const backtickContent = value
        .join("\n")
        .replace(/\\/g, "\\\\")
        .replace(/`/g, "\\`")
        // Only "${" starts an interpolation; a lone "$" (regex anchors) is fine.
        .replace(/\$\{/g, "\\${");
      lines.push(`${indent}  ${key}: \`${backtickContent}\`,`);
    } else {
      lines.push(`${indent}  ${key}: ${JSON.stringify(value)},`);
    }
  }

  lines.push(`${indent}}`);
  return lines.join("\n");
}

/**
 * Format an array of template objects as a JS array body (entries only, no brackets).
 */
function formatTemplateArray(templates, indent) {
  return templates.map((t) => formatTemplateEntry(t, indent) + ",").join("\n");
}

/**
 * Generate a JS SETTINGS const from the settings JSON object.
 */
function formatSettings(settings) {
  const lines = ["  // ===== GLOBAL SETTINGS =====", "  const SETTINGS = {"];
  for (const [key, value] of Object.entries(settings)) {
    lines.push(`    ${key}: ${JSON.stringify(value)},`);
  }
  lines.push("  };");
  return lines.join("\n");
}

// Load settings. configName names the user's config page
// (User:<name>/<configName>.json) and the settings page; each build gets its
// own, so a lens and the main script can be configured separately.
const settings = {
  configName: baseName,
  displayName: profileName ? `usefulQueries (${profileName})` : "usefulQueries",
  repositoryUrl: "https://github.com/kristbaum/usefulQueries",
  // Help for the settings page and editor (the "Your own buttons" section of
  // usefulQueries.wiki, published as User:Kristbaum/usefulQueries).
  helpUrl: "https://www.wikidata.org/wiki/User:Kristbaum/usefulQueries#Your_own_buttons",
  ...JSON.parse(await readFile(settingsPath, "utf8")),
};
// QLever (via the To QLever tool) only indexes Wikidata, so the runtime only
// ever sees enableQLever: true on Wikidata builds.
const isWikidata = settings.queryServiceUrl.includes("query.wikidata.org");
settings.enableQLever = isWikidata && settings.enableQLever === true;

console.log(
  `[assemble] Target: ${isWikidata ? "Wikidata" : "non-Wikidata"}, QLever: ${settings.enableQLever ? "on" : "off"}`,
);

// Load framework and templates. A malformed template is an authoring mistake,
// so report it plainly instead of dumping a stack trace.
const framework = await readFile(frameworkPath, "utf8");
let queries, links;
try {
  queries = await loadTemplates(queriesDir, "query");
  links = await loadTemplates(linksDir, "link");
} catch (err) {
  console.error(`[assemble] ${err.message}`);
  process.exit(1);
}

// Users hide built-ins by id, which must therefore be unique across both kinds.
const linkIds = new Set(links.map((t) => t.id));
const clashes = queries.filter((t) => linkIds.has(t.id)).map((t) => t.id);
if (clashes.length) {
  console.error(
    `[assemble] Query and link templates share id(s): ${clashes.join(", ")}`,
  );
  process.exit(1);
}

console.log(
  `[assemble] Loaded ${queries.length} query template(s) and ${links.length} link template(s)`,
);

// Load the source files (the shared ES modules as one inlined block)
const srcContents = {};
for (const file of SRC_FILES) {
  if (file === "<shared>") {
    const modules = await Promise.all(
      SHARED_MODULES.map((m) => readFile(path.join(repoRoot, m), "utf8")),
    );
    srcContents[file] = modules.map((code) => inlineModule(code).trim()).join("\n\n");
  } else {
    srcContents[file] = await readFile(path.join(srcDir, file), "utf8");
  }
}
console.log(`[assemble] Loaded ${SRC_FILES.length - 1} source files and ${SHARED_MODULES.length} shared modules`);

// Build the formatted template arrays
const queriesBlock = formatTemplateArray(queries, "    ");
const linksBlock = formatTemplateArray(links, "    ");
const settingsBlock = formatSettings(settings);

/**
 * Inject settings, templates and sources into the framework.
 * @param {Object<string, string>} srcContents - src file name → code
 */
function assembleWith(srcContents) {
  const sources = SRC_FILES.map((file) => srcContents[file].trimEnd()).join("\n\n");
  return framework
    .replace("    /* __USEFUL_QUERIES__ */", () => queriesBlock)
    .replace("    /* __USEFUL_LINKS__ */", () => linksBlock)
    .replace("  /* __SETTINGS__ */", () => settingsBlock)
    .replace("  /* __SOURCES__ */", () => sources);
}

/**
 * Collapse the whitespace of inline Vue templates (`template: \`<…>\``). Terser
 * keeps string contents verbatim, and the indentation is most of their size.
 * Only for the minified build; the readable one stays as written.
 * @param {string} code
 */
function compactVueTemplates(code) {
  return code.replace(/template: `([\s\S]*?)`/g, (match, body) =>
    body.includes("<") ? "template: `" + body.replace(/\s*\n\s*/g, " ").trim() + "`" : match,
  );
}

const assembled = assembleWith(srcContents);
// Write the assembled output
await writeFile(outputPath, assembled, "utf8");
const assembledBytes = Buffer.byteLength(assembled, "utf8");
console.log(
  `[assemble] Wrote ${path.relative(repoRoot, outputPath)} (${assembled.length} chars, ${(assembledBytes / 1024).toFixed(1)} KB)`,
);

// Minify
const forMinify = assembleWith(
  Object.fromEntries(
    Object.entries(srcContents).map(([file, code]) => [file, compactVueTemplates(code)]),
  ),
);
let header = "";
let code = forMinify;
if (forMinify.startsWith("/*")) {
  const endIndex = forMinify.indexOf("*/");
  if (endIndex !== -1) {
    header = forMinify.slice(0, endIndex + 2).trimEnd() + "\n";
    code = forMinify.slice(endIndex + 2);
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
  throw new Error("Terser did not produce output.");
}

await writeFile(minifiedPath, header + result.code + "\n", "utf8");
const minified = header + result.code + "\n";
const minifiedBytes = Buffer.byteLength(minified, "utf8");
console.log(
  `[assemble] Wrote ${path.relative(repoRoot, minifiedPath)} (${minified.length} chars, ${(minifiedBytes / 1024).toFixed(1)} KB)`,
);

// Keep the on-wiki documentation in sync with the shipped templates.
// Builds without a .wiki page (most profiles) are skipped silently.
const wikiResult = await updateWikiPage(wikiPath, queriesDir, linksDir);
if (wikiResult !== "skipped") {
  console.log(
    `[assemble] Generated sections in ${path.relative(repoRoot, wikiPath)}: ${wikiResult}`,
  );
}
