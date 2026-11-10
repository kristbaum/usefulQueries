// Prompt for an AI chatbot that writes the SPARQL of a query button.
//
// The button editor lets users describe what a button should show and copy a
// prompt that carries everything a chatbot needs to answer with a query that
// pastes straight into the editor: what usefulQueries is, where the button
// sits, which placeholders exist at that spot (with their values on the
// current item, for testing) and the query rules the build enforces. Pure
// string building, so the tests import it directly; the build inlines it like
// the other shared modules.

import { PLACEHOLDER_HELP } from "../../scripts/validate-templates.mjs";

/**
 * One sentence on where the button sits and what its query should be about.
 * @param {Object} spot - See buildQueryPrompt()
 * @returns {string}
 */
function describePromptSpot(spot) {
  if (spot.scope === "entity") {
    return "Next to the item's title, on every item. The query should make sense for any item.";
  }
  const prop = `“${spot.propertyLabel || spot.propertyId}” (${spot.propertyId})`;
  const section = spot.section || "statement";
  const kind = { statement: "", qualifiers: "qualifier ", references: "reference " }[section];
  const of = spot.statementText
    ? ` ${section === "qualifiers" ? "of" : "in a reference of"} the statement “${spot.statementText}”`
    : "";
  if (spot.scope === "property") {
    return (
      `Once, next to the ${kind}property ${prop}${of}. ` +
      "The query should use all of the property's values together, or none of them " +
      "(the property only shows that the item is of the right kind)."
    );
  }
  if (spot.valueIds && spot.valueIds.length) {
    return (
      `Next to the ${kind}property ${prop}${of}, but only when its value is ${spot.valueIds.join(" or ")}. ` +
      "The value only decides whether the button shows; the query should be about the item itself."
    );
  }
  const value = spot.valueLabel ? `, e.g. “${spot.valueLabel}”` : "";
  return (
    `Next to each ${kind}value of ${prop}${value}${of}. ` +
    "The query should be about that value (the object of the statement), " +
    "so an item with several values gets one button per value."
  );
}

// The answer format: a chatbot puts the button's title and emoji as comment
// lines at the top of its query, so one copy carries the whole button. The
// editor reads them off a pasted query with splitButtonHeader().
const HEADER_LINE_RE = /^\s*#\s*(title|emoji)\s*:\s*(.*?)\s*$/i;

/**
 * Header lines for a query: "#title: …" and "#emoji: …".
 * @param {string} [title]
 * @param {string} [emoji]
 * @returns {string[]}
 */
export function formatButtonHeader(title, emoji) {
  const out = [];
  if (title && title.trim()) out.push(`#title: ${title.trim()}`);
  if (emoji && emoji.trim()) out.push(`#emoji: ${emoji.trim()}`);
  return out;
}

/**
 * Take the "#title:" / "#emoji:" lines off the top of a query, e.g. one pasted
 * from a chatbot. A surrounding Markdown code fence is dropped as well. Only
 * leading lines count: the same text further down is an ordinary comment.
 * @param {string} text
 * @returns {{text: string, title: string|null, emoji: string|null, found: boolean}}
 *   `found` is true if either line was present; `text` is the rest
 */
export function splitButtonHeader(text) {
  let lines = String(text).replace(/\r\n?/g, "\n").split("\n");
  const firstCode = lines.findIndex((l) => l.trim() !== "");
  if (firstCode !== -1 && /^\s*```/.test(lines[firstCode])) {
    lines = lines.slice(firstCode + 1);
    let close = lines.length - 1;
    while (close >= 0 && !/^\s*```\s*$/.test(lines[close])) close--;
    if (close !== -1) lines = lines.slice(0, close);
  }
  const header = { title: null, emoji: null };
  let i = 0;
  for (; i < lines.length; i++) {
    if (lines[i].trim() === "") continue;
    const m = HEADER_LINE_RE.exec(lines[i]);
    if (!m) break;
    const key = m[1].toLowerCase();
    if (header[key] === null && m[2]) header[key] = m[2];
  }
  const found = header.title !== null || header.emoji !== null;
  return {
    text: found ? lines.slice(i).join("\n").replace(/\s+$/, "") : text,
    title: header.title,
    emoji: header.emoji,
    found,
  };
}

/**
 * What the title may contain: only the Wikidata information the script reads
 * from the page, i.e. the placeholders at this spot. Chatbots otherwise invent
 * names for other data of the item, like {startTime} for a qualifier.
 * @param {string[]} placeholders - Names available at this spot
 * @returns {string}
 */
function titleHint(placeholders) {
  const labels = ["valueLabel", "statementValueLabel", "itemLabel"].filter((n) => placeholders.includes(n));
  const example = labels.length ? ` For example {${labels[0]}}.` : "";
  return (
    "The title is built from the Wikidata information the script already has on the page, which is " +
    "exactly the placeholders listed above. Other data of the item (e.g. a start time qualifier) " +
    "has no placeholder; don't invent one." + example
  );
}

/**
 * Build the prompt.
 * @param {Object} opts
 * @param {string} opts.request - What the user wants the button to show
 * @param {string} opts.scope - "entity", "property" or "value"
 * @param {string} [opts.section] - "statement", "qualifiers" or "references"
 * @param {string} [opts.propertyId] - The property the button was added on
 * @param {string} [opts.propertyLabel]
 * @param {string[]} [opts.propertyIds] - All properties that trigger the button
 * @param {string[]} [opts.valueIds] - Values that gate the button, if any
 * @param {string} [opts.valueLabel] - The value the button was added on
 * @param {string} [opts.statementText] - "property → value" of the statement a
 *   qualifier or reference belongs to
 * @param {string[]} opts.placeholders - Placeholder names available at this spot
 * @param {Object} opts.context - Their values on the current item
 * @param {string} opts.itemId
 * @param {string} [opts.itemLabel]
 * @param {string} [opts.wikiName] - e.g. "Wikidata"
 * @param {string} opts.queryServiceUrl
 * @param {string} [opts.guideUrl] - The template guide
 * @param {string} [opts.currentQuery] - The query so far, to improve on
 * @param {string} [opts.currentTitle] - The button's title so far
 * @param {string} [opts.currentEmoji] - The button's emoji so far
 * @returns {string}
 */
export function buildQueryPrompt(opts) {
  const wiki = opts.wikiName || "Wikidata";
  const request = (opts.request || "").trim() || "(describe here what the button should show)";
  const item = opts.itemLabel && opts.itemLabel !== opts.itemId
    ? `${opts.itemLabel} (${opts.itemId})`
    : opts.itemId;
  const lines = [];
  const add = (...l) => lines.push(...l);

  add(
    "Please write a SPARQL query for a usefulQueries button. What the button should show:",
    "",
    request,
    "",
    "## Background",
    "",
    `usefulQueries is a user script for ${wiki}. On an item page it adds small buttons; a query ` +
      `button runs a SPARQL query on the query service (${opts.queryServiceUrl}) and shows the ` +
      "result in a popup. The query is a template: placeholders in curly braces, like {itemId}, " +
      "are filled in for whichever item the button appears on, so one query works on every item.",
    "",
    "## Where the button appears",
    "",
    `- ${describePromptSpot(opts)}`,
  );
  if (opts.scope !== "entity" && opts.propertyIds && opts.propertyIds.length > 1) {
    add(
      `- It appears for any of these properties: ${opts.propertyIds.join(", ")}. ` +
        "{propertyId} is the one that matched.",
    );
  }
  add(`- I am setting it up on the item ${item}.`);
  add(
    "",
    "If you think the button belongs somewhere else (for example next to each value instead of " +
      "once next to the property), tell me before writing the query.",
    "",
    `## Placeholders available here (value on ${opts.itemId} in brackets)`,
    "",
  );
  for (const name of opts.placeholders) {
    const value = opts.context[name];
    const example =
      value === undefined ? "" : value === "" ? " [empty here]" : ` [${value}]`;
    add(`- {${name}}${example}: ${PLACEHOLDER_HELP[name] || ""}`.trimEnd());
  }
  add(
    "",
    "## Rules",
    "",
    "- Use the placeholders instead of the IDs of this item or value, so the query works on other items. " +
      "Names ending in Id expand to a bare ID like Q42 and always need a prefix: wd:{itemId}, " +
      "wdt:{propertyId}. Never write one on its own: ps:P937 {valueId} becomes ps:P937 Q12892, a syntax " +
      "error. Only the …Sparql ones are complete SPARQL terms: use them as they are, without quotes or prefix.",
    "- No other {name} in curly braces, in the query or the title: anything else is not replaced " +
      "and the button is rejected.",
    `- Look up every property and item ID on ${wiki}; never write one from memory.`,
    "- Check on two or three real items how the data is modelled and that the query returns rows " +
      `for ${opts.itemId}. Test it with the placeholders filled in as above.`,
    "- Always set a LIMIT (usually 100–400). If the core pattern can match many rows, LIMIT them " +
      "in a subselect first and add OPTIONALs and labels outside it.",
    '- End the WHERE clause with SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],mul,en". }',
    "- Never put two unconnected patterns in one OPTIONAL; write one OPTIONAL per pattern.",
    "- Don't repeat the same OPTIONAL in several UNION arms; put it once after the UNION.",
    "- Avoid property-path alternation like (wdt:P1|wdt:P2) on large relations; use UNION, " +
      "or {propertyId} when the query is about the property the button sits on.",
    "- Prefer wdt:; use p:/ps:/pq: only when you need qualifiers.",
    "- It must finish well within the 60 s limit, also on big items (a capital city, a large organisation).",
    "- The first line may choose a result view: #defaultView:Map (needs a coordinate column), " +
      "#defaultView:Timeline (a date column), #defaultView:ImageGrid (an image column), " +
      "#defaultView:Graph, #defaultView:BarChart, #defaultView:LineChart. Otherwise it is a table. " +
      "Select ?xLabel for every item column shown.",
  );
  if (opts.scope === "property") {
    add(
      "- Don't read the property's values back out of the item (wd:{itemId} wdt:P… ?x) unless the " +
        "query really means all values together; a per-value query belongs next to each value.",
    );
  }
  const current = (opts.currentQuery || "").trim();
  if (current) {
    add(
      "",
      "## Current button (improve on this)",
      "",
      "```sparql",
      ...formatButtonHeader(opts.currentTitle, opts.currentEmoji),
      current,
      "```",
    );
  }
  add(
    "",
    "## Answer with",
    "",
    "A single ```sparql code block that I paste into the editor as a whole. Its first two lines name " +
      "the button; the editor reads them into the button's fields and removes them from the query:",
    "",
    "```sparql",
    "#title: <title of the button: tooltip and popup heading>",
    "#emoji: <one emoji as the button's label>",
    "#defaultView:… (optional)",
    "SELECT …",
    "```",
    "",
    `${titleHint(opts.placeholders)} Below the two lines comes the query with placeholders; short # ` +
      "comments saying what it does are welcome. Put any explanation outside the code block.",
  );
  if (opts.guideUrl) {
    add(
      "",
      `The full guide, with more rules and examples: ${opts.guideUrl}`,
      "It describes complete JSON template files; I only need the query, because I paste it into " +
        "the script's on-wiki button editor.",
    );
  }
  return lines.join("\n");
}
