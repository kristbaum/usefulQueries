// Build-time validation for templates/queries/*.json and templates/links/*.json.
//
// Templates are hand-written JSON that gets inlined into the shipped script. A
// malformed one produces no build error and no runtime error — the button just
// silently never appears. These checks turn that into a failed build instead.

import { checkSparql } from "./check-sparql.mjs";

const SCOPES = ["entity", "property", "value"];

// Placeholders replaced by replacePlaceholders() in src/helpers.js. Anything
// else survives into the SPARQL query / URL verbatim and breaks it.
const BASE_PLACEHOLDERS = ["itemQid", "itemLabel", "userLanguage"];
// valueLat / valueLon are only filled for globe-coordinate values (P625 and
// friends); on any other datatype they resolve to an empty string.
const VALUE_PLACEHOLDERS = ["valueQid", "valueLabel", "valueLat", "valueLon"];

// Matches {itemQid} but not SPARQL graph patterns like `{ bd:serviceParam … }`,
// which always contain a space, colon or `?` before the closing brace.
const PLACEHOLDER_RE = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

const COMMON_FIELDS = [
  "id",
  "example",
  "scope",
  "propertyId",
  "valueId",
  "emoji",
  "title",
];
const FIELDS = {
  query: [...COMMON_FIELDS, "template"],
  link: [...COMMON_FIELDS, "urlTemplate"],
};

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function collectPlaceholders(text) {
  return [...text.matchAll(PLACEHOLDER_RE)].map((m) => m[1]);
}

/**
 * Validate one parsed template object.
 * @param {unknown} tpl - The parsed JSON
 * @param {"query"|"link"} kind - Which template flavour to check against
 * @returns {string[]} Human-readable problems; empty means valid.
 */
export function validateTemplate(tpl, kind) {
  const errors = [];

  if (tpl === null || typeof tpl !== "object" || Array.isArray(tpl)) {
    return ["must be a JSON object"];
  }

  // --- unknown / misspelled fields ---
  const allowed = FIELDS[kind];
  for (const key of Object.keys(tpl)) {
    if (!allowed.includes(key)) {
      errors.push(`unknown field "${key}" (allowed: ${allowed.join(", ")})`);
    }
  }

  // --- id ---
  if (!isNonEmptyString(tpl.id)) {
    errors.push('"id" must be a non-empty string');
  }

  // --- example: an item this template can be tried out on, for debugging ---
  if (typeof tpl.example !== "string" || !/^Q\d+$/.test(tpl.example)) {
    errors.push(
      '"example" must be an item ID (Q123) where this template can be tested',
    );
  }

  // --- scope ---
  const scope = tpl.scope;
  if (!SCOPES.includes(scope)) {
    errors.push(
      `"scope" must be one of ${SCOPES.join(" | ")}, got ${JSON.stringify(scope)}`,
    );
  }

  // --- propertyId: required for property/value, forbidden for entity ---
  if (scope === "entity") {
    if (tpl.propertyId !== undefined) {
      errors.push('"propertyId" is not used with scope "entity" — remove it');
    }
  } else if (SCOPES.includes(scope)) {
    if (!Array.isArray(tpl.propertyId) || tpl.propertyId.length === 0) {
      errors.push(
        `"propertyId" must be a non-empty array for scope "${scope}"`,
      );
    } else {
      for (const id of tpl.propertyId) {
        if (typeof id !== "string" || !/^P\d+$/.test(id)) {
          errors.push(
            `"propertyId" entry ${JSON.stringify(id)} is not a property ID (P123)`,
          );
        }
      }
    }
  }

  // --- valueId: only meaningful for scope "value"; null means "any value" ---
  if (tpl.valueId !== undefined && tpl.valueId !== null) {
    if (scope !== "value") {
      errors.push(`"valueId" only applies to scope "value", not "${scope}"`);
    }
    if (!Array.isArray(tpl.valueId)) {
      errors.push(
        '"valueId" must be an array of QIDs, or null to match any value',
      );
    } else {
      for (const id of tpl.valueId) {
        if (typeof id !== "string" || !/^Q\d+$/.test(id)) {
          errors.push(
            `"valueId" entry ${JSON.stringify(id)} is not an item ID (Q123)`,
          );
        }
      }
    }
  }

  // --- emoji / title ---
  if (!isNonEmptyString(tpl.emoji)) {
    errors.push('"emoji" must be a non-empty string');
  }
  if (!isNonEmptyString(tpl.title)) {
    errors.push('"title" must be a non-empty string');
  }

  // --- payload: template (queries) vs urlTemplate (links) ---
  const texts = [];
  if (isNonEmptyString(tpl.title)) {
    texts.push(["title", tpl.title]);
  }

  if (kind === "query") {
    if (!Array.isArray(tpl.template) || tpl.template.length === 0) {
      errors.push('"template" must be a non-empty array of SPARQL lines');
    } else if (!tpl.template.every((line) => typeof line === "string")) {
      errors.push(
        '"template" must contain only strings (one SPARQL line each)',
      );
    } else {
      texts.push(["template", tpl.template.join("\n")]);
      // Portability between WDQS and QLever — see AGENTS.md.
      errors.push(...checkSparql(tpl.template));
    }
  } else {
    if (!isNonEmptyString(tpl.urlTemplate)) {
      errors.push('"urlTemplate" must be a non-empty string');
    } else if (!/^https?:\/\//.test(tpl.urlTemplate)) {
      errors.push('"urlTemplate" must start with http:// or https://');
    } else {
      texts.push(["urlTemplate", tpl.urlTemplate]);
    }
  }

  // --- placeholders ---
  const known =
    scope === "value"
      ? [...BASE_PLACEHOLDERS, ...VALUE_PLACEHOLDERS]
      : BASE_PLACEHOLDERS;

  for (const [field, text] of texts) {
    for (const name of new Set(collectPlaceholders(text))) {
      if (known.includes(name)) continue;
      if (VALUE_PLACEHOLDERS.includes(name)) {
        errors.push(
          `"${field}" uses {${name}}, which is only available with scope "value"`,
        );
      } else {
        errors.push(
          `"${field}" uses unknown placeholder {${name}} (known: ${known.map((p) => `{${p}}`).join(", ")})`,
        );
      }
    }
  }

  return errors;
}

/**
 * Validate a batch of loaded templates and throw a single aggregated error.
 * @param {{file: string, data: unknown}[]} loaded - Templates with their filenames
 * @param {"query"|"link"} kind
 * @param {string} label - Directory shown in the error message
 */
export function assertTemplatesValid(loaded, kind, label) {
  const report = [];
  for (const { file, data } of loaded) {
    const errors = validateTemplate(data, kind);
    if (errors.length) {
      report.push(`  ${file}:\n${errors.map((e) => `    - ${e}`).join("\n")}`);
    }
  }
  if (report.length) {
    throw new Error(
      `Invalid ${kind} template(s) in ${label}:\n${report.join("\n")}`,
    );
  }
}
