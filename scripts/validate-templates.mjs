// Build-time validation for templates/queries/*.json and templates/links/*.json.
//
// Templates are hand-written JSON that gets inlined into the shipped script. A
// malformed one produces no build error and no runtime error — the button just
// silently never appears. These checks turn that into a failed build instead.

import { checkSparql } from "./check-sparql.mjs";

const SCOPES = ["entity", "property", "value"];

// Placeholders replaced by replacePlaceholders() in src/helpers.js. Anything
// else survives into the SPARQL query / URL verbatim and breaks it.
// Naming: `…Id` is always a bare entity ID (Q42, P19) that you prefix yourself
// (wd:{itemId}); `valueSparql` is the one that is already a SPARQL term.
export const BASE_PLACEHOLDERS = ["itemId", "itemLabel", "userLanguage"];
// The property the button is attached to. Only bound for scope "property" and
// "value" — an entity-scope button hangs off the title and matched no property.
export const PROPERTY_PLACEHOLDERS = ["propertyId"];
// valueId is empty unless the value is an item/property; valueLatitude /
// valueLongitude are only filled for globe-coordinate values (P625 and
// friends); on any other datatype they resolve to an empty string.
export const VALUE_PLACEHOLDERS = [
  "valueId",
  "valueSparql",
  "valueLabel",
  "valueLatitude",
  "valueLongitude",
];

// The statement a qualifier or reference belongs to. Only bound for templates
// with "section": "qualifiers" or "references".
export const STATEMENT_PLACEHOLDERS = [
  "statementPropertyId",
  "statementValueId",
  "statementValueSparql",
  "statementValueLabel",
];

// Where on a statement a property/value template hangs. Omitted = "statement",
// the statement's own value.
export const SECTIONS = ["statement", "qualifiers", "references"];

// One-line help per placeholder, shown as tooltips in the button editor.
// In triple terms: the item is the subject, the property the predicate and the
// statement's value the object.
export const PLACEHOLDER_HELP = {
  itemId: "ID of the item (the subject), e.g. Q42. Write wd:{itemId}.",
  itemLabel: "Label of the item in your language, falling back to other languages, then to its ID.",
  userLanguage: "Code of your interface language, e.g. en or de.",
  propertyId: "The property (predicate) the button sits on, e.g. P19. Write wdt:{propertyId}.",
  valueId: "ID of the object (the statement's value) if it is an item, e.g. Q64. Write wd:{valueId}. Empty for text, dates and numbers.",
  valueSparql: "The object of any type, already written as SPARQL: wd:Q64, \"91E23\" (with quotes), a date… Use as is, without extra quotes.",
  valueLabel: "Readable form of the object, for titles.",
  valueLatitude: "Latitude of a coordinate object (P625); empty for other values.",
  valueLongitude: "Longitude of a coordinate object (P625); empty for other values.",
  statementPropertyId: "Property of the statement this qualifier or reference belongs to, e.g. P39. Write p:/ps:{statementPropertyId}.",
  statementValueId: "Value of that statement if it is an item, e.g. Q11696. Write wd:{statementValueId}.",
  statementValueSparql: "Value of that statement of any type, already written as SPARQL.",
  statementValueLabel: "Readable form of that statement's value, for titles.",
};

// Names used before the placeholders were renamed, with what to write now.
const RENAMED_PLACEHOLDERS = {
  itemQid: "{itemId}",
  propertyPid: "{propertyId}",
  valueQid: "wd:{valueId} for item values, or {valueSparql} for any datatype",
  valueLat: "{valueLatitude}",
  valueLon: "{valueLongitude}",
};

// Matches {itemId} but not SPARQL graph patterns like `{ bd:serviceParam … }`,
// which always contain a space, colon or `?` before the closing brace.
const PLACEHOLDER_RE = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

const COMMON_FIELDS = [
  "id",
  "example",
  "scope",
  "section",
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
 * @param {{sparqlChecks?: boolean}} [options] - sparqlChecks: also run the
 *   WDQS/QLever portability rules (default true). The runtime turns them off
 *   for templates from a user's config page and shows them as warnings instead.
 * @returns {string[]} Human-readable problems; empty means valid.
 */
export function validateTemplate(tpl, kind, options = {}) {
  const sparqlChecks = options.sparqlChecks !== false;
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

  // --- section: which part of a statement (main value, qualifiers, references) ---
  const section = tpl.section === undefined ? "statement" : tpl.section;
  if (tpl.section !== undefined) {
    if (!SECTIONS.includes(tpl.section)) {
      errors.push(
        `"section" must be one of ${SECTIONS.join(" | ")}, got ${JSON.stringify(tpl.section)}`,
      );
    } else if (scope === "entity") {
      errors.push('"section" is not used with scope "entity" — remove it');
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
      // Portability between WDQS and QLever — see TEMPLATE_GUIDE.md.
      if (sparqlChecks) errors.push(...checkSparql(tpl.template));
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
  const known = [...BASE_PLACEHOLDERS];
  if (scope === "property" || scope === "value") {
    known.push(...PROPERTY_PLACEHOLDERS);
  }
  if (scope === "value") {
    known.push(...VALUE_PLACEHOLDERS);
  }
  const inSubsection = section === "qualifiers" || section === "references";
  if (inSubsection && scope !== "entity") {
    known.push(...STATEMENT_PLACEHOLDERS);
  }

  for (const [field, text] of texts) {
    for (const name of new Set(collectPlaceholders(text))) {
      if (known.includes(name)) continue;
      if (Object.hasOwn(RENAMED_PLACEHOLDERS, name)) {
        errors.push(
          `"${field}" uses {${name}}, which has been renamed — use ${RENAMED_PLACEHOLDERS[name]}`,
        );
      } else if (STATEMENT_PLACEHOLDERS.includes(name)) {
        errors.push(
          `"${field}" uses {${name}}, which is only available with "section": "qualifiers" or "references"`,
        );
      } else if (VALUE_PLACEHOLDERS.includes(name)) {
        errors.push(
          `"${field}" uses {${name}}, which is only available with scope "value"`,
        );
      } else if (PROPERTY_PLACEHOLDERS.includes(name)) {
        errors.push(
          `"${field}" uses {${name}}, which is only available with scope "property" or "value"`,
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
// oxlint-disable-next-line no-unused-vars -- build-only; unused once inlined into the shipped script
export function assertTemplatesValid(loaded, kind, label) {
  const report = [];
  const seenIds = new Map();
  for (const { file, data } of loaded) {
    if (data && typeof data.id === "string") {
      if (seenIds.has(data.id)) {
        report.push(
          `  ${file}:\n    - "id" ${JSON.stringify(data.id)} is already used by ${seenIds.get(data.id)} (ids must be unique; users hide built-in buttons by id)`,
        );
      } else {
        seenIds.set(data.id, file);
      }
    }
  }
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
