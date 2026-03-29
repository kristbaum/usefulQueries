import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { minify } from "terser";

const repoRoot = path.resolve(process.cwd());
const frameworkPath = path.join(repoRoot, "framework.js");
const settingsPath = path.join(repoRoot, "src", "settings.json");
const srcDir = path.join(repoRoot, "src");
const queriesDir = path.join(repoRoot, "templates", "queries");
const linksDir = path.join(repoRoot, "templates", "links");
const outputPath = path.join(repoRoot, "usefulQueries.js");
const minifiedPath = path.join(repoRoot, "minified_version.js");

// Source files to include, in dependency order
const SRC_FILES = [
  "helpers.js",
  "qlever.js",
  "ui.js",
  "dom.js",
  "processing.js",
  "main.js",
];

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
  const jsonFiles = entries.filter((f) => f.endsWith(".json")).sort();
  const templates = [];
  for (const file of jsonFiles) {
    const content = await readFile(path.join(dir, file), "utf8");
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
    if (key === "template") {
      // "template" must be an array of lines, joined with \n at build time.
      const backtickContent = value.join("\n")
        .replace(/\\/g, "\\\\")
        .replace(/`/g, "\\`")
        .replace(/\$/g, "\\$");
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
  return templates
    .map((t, i) => {
      const entry = formatTemplateEntry(t, indent);
      return i < templates.length - 1 ? entry + "," : entry + ",";
    })
    .join("\n");
}

/**
 * Generate a JS SETTINGS const from the settings JSON object.
 */
function formatSettings(settings) {
  const lines = ["  // ===== GLOBAL SETTINGS =====", "  const SETTINGS = {"];
  const entries = Object.entries(settings);
  entries.forEach(([key, value], i) => {
    const comma = i < entries.length - 1 ? "," : ",";
    lines.push(`    ${key}: ${JSON.stringify(value)}${comma}`);
  });
  lines.push("  };");
  return lines.join("\n");
}

/**
 * Strip conditional blocks from source code based on QLever inclusion.
 * Markers: __IF_QLEVER__ / __ENDIF_QLEVER__ and __IF_NOT_QLEVER__ / __ENDIF_NOT_QLEVER__
 */
function processConditionals(code, includeQLever) {
  let result = code;

  if (includeQLever) {
    // Keep __IF_QLEVER__ content, remove __IF_NOT_QLEVER__ content
    result = result.replace(/^.*\/\* __IF_QLEVER__ \*\/.*\n/gm, "");
    result = result.replace(/^.*\/\* __ENDIF_QLEVER__ \*\/.*\n/gm, "");
    result = result.replace(
      /^.*\/\* __IF_NOT_QLEVER__ \*\/.*\n[\s\S]*?^.*\/\* __ENDIF_NOT_QLEVER__ \*\/.*\n/gm,
      "",
    );
  } else {
    // Keep __IF_NOT_QLEVER__ content, remove __IF_QLEVER__ content
    result = result.replace(/^.*\/\* __IF_NOT_QLEVER__ \*\/.*\n/gm, "");
    result = result.replace(/^.*\/\* __ENDIF_NOT_QLEVER__ \*\/.*\n/gm, "");
    result = result.replace(
      /^.*\/\* __IF_QLEVER__ \*\/.*\n[\s\S]*?^.*\/\* __ENDIF_QLEVER__ \*\/.*\n/gm,
      "",
    );
  }

  return result;
}

// Load settings
const settings = JSON.parse(await readFile(settingsPath, "utf8"));
const isWikidata = settings.queryServiceUrl.includes("query.wikidata.org");
const includeQLever = isWikidata && settings.enableQLever;

console.log(
  `[assemble] Target: ${isWikidata ? "Wikidata" : "non-Wikidata"}, QLever: ${includeQLever ? "included" : "omitted"}`,
);

// Load framework and templates
const framework = await readFile(frameworkPath, "utf8");
const queries = await loadTemplates(queriesDir);
const links = await loadTemplates(linksDir);

console.log(
  `[assemble] Loaded ${queries.length} query template(s) and ${links.length} link template(s)`,
);

// Load and concatenate source files
const srcContents = {};
for (const file of SRC_FILES) {
  if (file === "qlever.js" && !includeQLever) {
    console.log(`[assemble] Skipping src/${file} (QLever not applicable)`);
    srcContents[file] = "";
    continue;
  }
  const content = await readFile(path.join(srcDir, file), "utf8");
  srcContents[file] = processConditionals(content, includeQLever);
  console.log(`[assemble] Loaded src/${file}`);
}

// Build the formatted template arrays
const queriesBlock = formatTemplateArray(queries, "    ");
const linksBlock = formatTemplateArray(links, "    ");
const settingsBlock = formatSettings(settings);

// Inject everything into framework
let assembled = framework;
assembled = assembled.replace("    /* __USEFUL_QUERIES__ */", queriesBlock);
assembled = assembled.replace("    /* __USEFUL_LINKS__ */", linksBlock);
assembled = assembled.replace("  /* __SETTINGS__ */", settingsBlock);
assembled = assembled.replace(
  "  /* __HELPERS__ */",
  srcContents["helpers.js"].trimEnd(),
);
assembled = assembled.replace(
  "  /* __QLEVER__ */",
  srcContents["qlever.js"].trimEnd(),
);
assembled = assembled.replace("  /* __UI__ */", srcContents["ui.js"].trimEnd());
assembled = assembled.replace(
  "  /* __DOM__ */",
  srcContents["dom.js"].trimEnd(),
);
assembled = assembled.replace(
  "  /* __PROCESSING__ */",
  srcContents["processing.js"].trimEnd(),
);
assembled = assembled.replace(
  "  /* __MAIN__ */",
  srcContents["main.js"].trimEnd(),
);

// Clean up any double blank lines left from omitted sections
assembled = assembled.replace(/\n{3,}/g, "\n\n");

// Write the assembled output
await writeFile(outputPath, assembled, "utf8");
console.log(`[assemble] Wrote ${path.relative(repoRoot, outputPath)}`);

// Minify
let header = "";
let code = assembled;
if (assembled.startsWith("/*")) {
  const endIndex = assembled.indexOf("*/");
  if (endIndex !== -1) {
    header = assembled.slice(0, endIndex + 2).trimEnd() + "\n";
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
  throw new Error("Terser did not produce output.");
}

await writeFile(minifiedPath, header + result.code + "\n", "utf8");
console.log(`[assemble] Wrote ${path.relative(repoRoot, minifiedPath)}`);
