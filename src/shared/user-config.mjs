// Per-user configuration: the pure part.
//
// A user's choices live on a JSON page in their own user space,
// User:<name>/<configName>.json (only the owner and interface admins can edit
// it). This module parses, validates and merges that page and holds the
// helpers the editor needs. It touches no DOM and no mw.* API, so the tests
// import it directly; the build strips the `import`/`export` keywords and
// inlines it into the shipped script, like validate-templates.mjs.

import { validateTemplate } from "../../scripts/validate-templates.mjs";

export const CONFIG_VERSION = 1;

// Prefix for ids of user-made templates, so they never collide with built-ins.
export const USER_ID_PREFIX = "u_";

/**
 * A fresh config. `seen` lists the built-in ids the user has been shown, so a
 * built-in added in a later release can be flagged as new on the settings page.
 * @param {string[]} [builtinIds]
 */
export function emptyConfig(builtinIds = []) {
  return {
    version: CONFIG_VERSION,
    disabled: [],
    seen: [...builtinIds],
    queries: [],
    links: [],
  };
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/**
 * Validate a parsed config object. Invalid templates are dropped, not fatal:
 * one bad entry must not take the user's other buttons down with it.
 * @param {unknown} raw - The parsed JSON page
 * @param {string[]} builtinIds - Ids of the templates shipped in this build
 * @returns {{config: object, errors: string[]}} A clean config and the problems
 *   found, each prefixed with where it was found.
 */
export function validateUserConfig(raw, builtinIds = []) {
  const errors = [];
  const config = emptyConfig();
  config.seen = [];

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { config, errors: ["the page must contain a JSON object"] };
  }

  if (raw.version !== undefined && raw.version !== CONFIG_VERSION) {
    errors.push(
      `"version" is ${JSON.stringify(raw.version)}; this script understands version ${CONFIG_VERSION}`,
    );
  }

  for (const key of ["disabled", "seen"]) {
    if (raw[key] === undefined) continue;
    if (isStringArray(raw[key])) {
      config[key] = [...new Set(raw[key])];
    } else {
      errors.push(`"${key}" must be a list of template ids`);
    }
  }

  const usedIds = new Set();
  for (const [field, kind] of [
    ["queries", "query"],
    ["links", "link"],
  ]) {
    if (raw[field] === undefined) continue;
    if (!Array.isArray(raw[field])) {
      errors.push(`"${field}" must be a list`);
      continue;
    }
    raw[field].forEach((tpl, i) => {
      const where =
        tpl && typeof tpl.id === "string" ? `${field}[${i}] "${tpl.id}"` : `${field}[${i}]`;
      const problems = validateTemplate(tpl, kind, { sparqlChecks: false });
      if (!problems.length) {
        if (builtinIds.includes(tpl.id)) {
          problems.push(`"id" ${JSON.stringify(tpl.id)} is a built-in id — pick another`);
        } else if (usedIds.has(tpl.id)) {
          problems.push(`"id" ${JSON.stringify(tpl.id)} is used twice`);
        }
      }
      if (problems.length) {
        errors.push(...problems.map((p) => `${where}: ${p}`));
      } else {
        usedIds.add(tpl.id);
        config[field].push(tpl);
      }
    });
  }

  return { config, errors };
}

/**
 * Parse the text of a config page.
 * @param {string|null} text - Page content, or null when the page is missing
 * @param {string[]} builtinIds
 * @returns {{config: object, errors: string[], exists: boolean}}
 */
export function parseUserConfig(text, builtinIds = []) {
  if (text === null || text === undefined) {
    return { config: emptyConfig(builtinIds), errors: [], exists: false };
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return {
      config: emptyConfig(builtinIds),
      errors: [`not valid JSON: ${err.message}`],
      exists: true,
    };
  }
  return { ...validateUserConfig(raw, builtinIds), exists: true };
}

/** Serialise a config for saving: stable key order, one SPARQL line per row. */
export function serializeConfig(config) {
  return JSON.stringify(
    {
      version: CONFIG_VERSION,
      disabled: config.disabled,
      seen: config.seen,
      queries: config.queries,
      links: config.links,
    },
    null,
    2,
  );
}

/**
 * Convert a template from its JSON form (SPARQL as an array of lines) to the
 * form the runtime index expects (one string), as the build does for built-ins.
 */
export function toRuntimeTemplate(tpl) {
  return Array.isArray(tpl.template) ? { ...tpl, template: tpl.template.join("\n") } : tpl;
}

/**
 * The templates that should be active: built-ins minus the disabled ones,
 * followed by the user's own.
 * @param {object[]} builtins - Built-in templates (runtime form)
 * @param {object[]} userTemplates - User templates (JSON form)
 * @param {string[]} disabled - Built-in ids the user switched off
 */
export function mergeTemplates(builtins, userTemplates, disabled) {
  const off = new Set(disabled);
  return [
    ...builtins.filter((t) => !off.has(t.id)),
    ...userTemplates.map(toRuntimeTemplate),
  ];
}

/**
 * Extract the SPARQL text from a Query Service URL, e.g.
 * https://query.wikidata.org/#SELECT... or .../embed.html#..., also with the
 * `#query=` form some tools produce. Short links (w.wiki/…) cannot be resolved
 * from the browser and return null.
 * @param {string} url
 * @returns {string|null}
 */
export function queryFromServiceUrl(url) {
  const trimmed = String(url || "").trim();
  const hash = trimmed.indexOf("#");
  if (hash === -1) return null;
  let fragment = trimmed.slice(hash + 1);
  if (fragment.startsWith("query=")) fragment = fragment.slice("query=".length);
  if (!fragment) return null;
  try {
    const text = decodeURIComponent(fragment);
    return text.trim() ? text : null;
  } catch {
    return null;
  }
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Turn a query written for one concrete item back into a template: replace the
 * item's ID with {itemId} and, for value buttons, the object (the value the
 * button belongs to) with
 * {valueId} (item/property values, so wd:Q64 becomes wd:{valueId}) or
 * {valueSparql} (any other datatype, e.g. "91E23"); for qualifier and
 * reference buttons also the statement's value with {statementValueId}. Only
 * whole IDs are replaced (Q64 never matches inside Q640).
 * @param {string} text - SPARQL with concrete IDs
 * @param {{itemId: string, valueId?: string|null, valueSparql?: string|null, statementValueId?: string|null}} ctx
 * @returns {{text: string, replacements: {from: string, to: string, count: number}[]}}
 */
export function generalizeQuery(text, ctx) {
  let result = text;
  const replacements = [];

  function replace(pattern, to, from) {
    let count = 0;
    result = result.replace(pattern, (...args) => {
      count++;
      // Keep the character before the ID (space, colon of wd:, …) in group 1.
      return (typeof args[1] === "string" ? args[1] : "") + to;
    });
    if (count) replacements.push({ from, to, count });
  }

  const wholeId = (id) => new RegExp(`(^|[^A-Za-z0-9_])${id}(?![0-9])`, "g");

  // The value first: on a self-referencing statement the item and the value can
  // be the same, and the object is the more specific reading.
  if (ctx.valueId && /^[QPL]\d+$/.test(ctx.valueId)) {
    if (ctx.valueId !== ctx.itemId) replace(wholeId(ctx.valueId), "{valueId}", ctx.valueId);
  } else if (ctx.valueSparql && ctx.valueSparql.length > 2) {
    replace(new RegExp(`()${escapeRegExp(ctx.valueSparql)}`, "g"), "{valueSparql}", ctx.valueSparql);
  }
  const statementId = ctx.statementValueId;
  if (
    statementId &&
    /^[QPL]\d+$/.test(statementId) &&
    statementId !== ctx.valueId &&
    statementId !== ctx.itemId
  ) {
    replace(wholeId(statementId), "{statementValueId}", statementId);
  }
  if (ctx.itemId) replace(wholeId(ctx.itemId), "{itemId}", ctx.itemId);
  return { text: result, replacements };
}

/**
 * Remove a user template from a config, whichever kind it is. Changes
 * `config` in place (it may be reactive Vue state).
 * @param {object} config
 * @param {string} id
 */
export function removeTemplate(config, id) {
  config.queries = config.queries.filter((t) => t.id !== id);
  config.links = config.links.filter((t) => t.id !== id);
}

/**
 * A new id for a user template, unique among `existingIds`.
 * @param {string} title - Used to make the id readable in the JSON page
 * @param {Iterable<string>} existingIds
 */
export function makeTemplateId(title, existingIds) {
  const taken = new Set(existingIds);
  const slug =
    String(title || "")
      .replace(/\{[^}]*\}/g, "")
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9]+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean)
      .slice(0, 5)
      .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
      .join("") || "button";
  let id = USER_ID_PREFIX + slug;
  for (let n = 2; taken.has(id); n++) id = `${USER_ID_PREFIX}${slug}${n}`;
  return id;
}

/**
 * Copy templates from someone else's config into `config`, renaming ids that
 * are already taken. Returns the new config; `config` is left untouched.
 * @param {object} config
 * @param {{kind: "query"|"link", template: object}[]} picked
 * @param {string[]} builtinIds
 */
export function importTemplates(config, picked, builtinIds = []) {
  const next = { ...config, queries: [...config.queries], links: [...config.links] };
  const taken = new Set([
    ...builtinIds,
    ...next.queries.map((t) => t.id),
    ...next.links.map((t) => t.id),
  ]);
  for (const { kind, template } of picked) {
    let id = template.id;
    if (taken.has(id) || !id.startsWith(USER_ID_PREFIX)) {
      id = makeTemplateId(template.title, taken);
    }
    taken.add(id);
    (kind === "query" ? next.queries : next.links).push({ ...template, id });
  }
  return next;
}

/**
 * Prefilled "new issue" link proposing a user template for everyone.
 * @param {object} tpl - Template in JSON form
 * @param {"query"|"link"} kind
 * @param {string} repoUrl - e.g. https://github.com/kristbaum/usefulQueries
 */
export function suggestionIssueUrl(tpl, kind, repoUrl) {
  const file = `templates/${kind === "query" ? "queries" : "links"}/${tpl.id.replace(
    new RegExp(`^${USER_ID_PREFIX}`),
    "",
  )}.json`;
  const body = [
    `Suggested ${kind} button from the usefulQueries editor.`,
    "",
    `Proposed file: \`${file}\``,
    "",
    "```json",
    JSON.stringify(tpl, null, 2),
    "```",
  ].join("\n");
  return (
    `${repoUrl}/issues/new?title=${encodeURIComponent(`New ${kind}: ${tpl.title}`)}` +
    `&body=${encodeURIComponent(body)}`
  );
}
