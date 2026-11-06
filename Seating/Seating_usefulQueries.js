/*
 * usefulQueries: adds buttons to Wikibase item pages that run SPARQL queries
 * or open external tools relevant to the item's statements.
 *
 * Documentation: https://www.wikidata.org/wiki/User:Kristbaum/usefulQueries
 *
 * License of this file: CC0
 */

$(function () {
  "use strict";

  // ===== GLOBAL SETTINGS =====
  const SETTINGS = {
    configName: "Seating_usefulQueries",
    displayName: "usefulQueries (Seating)",
    repositoryUrl: "https://github.com/kristbaum/usefulQueries",
    helpUrl: "https://www.wikidata.org/wiki/User:Kristbaum/usefulQueries#Your_own_buttons",
    queryServiceUrl: "https://query.wikidata.org/",
    queryEmbedUrl: "https://query.wikidata.org/embed.html",
    enableQLever: true,
    toQLeverUrl: "https://to-qlever.toolforge.org/to-qlever",
    allowedNamespace: 0,
  };

  // The settings page, Special:BlankPage/<configName>.
  const ON_SETTINGS_PAGE =
    mw.config.get("wgCanonicalSpecialPageName") === "Blankpage" &&
    String(mw.config.get("wgPageName")).split("/").slice(1).join("/") === SETTINGS.configName;

  // The user's own config page, User:<name>/<configName>.json.
  const ON_CONFIG_PAGE =
    mw.config.get("wgNamespaceNumber") === 2 &&
    String(mw.config.get("wgTitle")) ===
      String(mw.config.get("wgUserName")) + "/" + SETTINGS.configName + ".json";

  // Otherwise only run on items (the main namespace on Wikidata).
  if (
    !ON_SETTINGS_PAGE &&
    !ON_CONFIG_PAGE &&
    mw.config.get("wgNamespaceNumber") !== SETTINGS.allowedNamespace
  ) {
    return;
  }

  // Built-in templates, inlined from templates/queries/*.json and
  // templates/links/*.json by the build. Field reference: TEMPLATE_GUIDE.md.
  // (The build joins each query's SPARQL lines into one string.)
  const USEFUL_QUERIES = [
    {
      id: "coParticipantGraph",
      example: "Q140068424",
      scope: "value",
      propertyId: ["P710"],
      valueId: null,
      template: `#defaultView:Graph
# Where else did this participant meet people: the other events they are
# recorded at, each one surrounded by its own attendees. Two levels out of
# one row set - level 1 links the person to the event, level 2 the event to
# its other participants - which keeps the graph connected without a UNION
# of BIND-only arms (Blazegraph leaves ?event unbound in those, and the
# image OPTIONALs below then scan every P18 in the store).
SELECT DISTINCT ?node ?nodeLabel ?nodeImage ?childNode ?childNodeLabel ?childNodeImage WHERE {
  {
    SELECT DISTINCT ?event ?other WHERE {
      ?event wdt:P710 wd:{valueId}.
      ?event wdt:P710 ?other.
      FILTER(?other != wd:{valueId})
      # Participants recorded as unknown value are blank nodes with no label.
      FILTER(STRSTARTS(STR(?other), "http://www.wikidata.org/entity/Q"))
    }
    LIMIT 300
  }
  VALUES ?level { 1 2 }
  BIND(IF(?level = 1, wd:{valueId}, ?event) AS ?node)
  BIND(IF(?level = 1, ?event, ?other) AS ?childNode)
  OPTIONAL { ?node wdt:P18 ?nodeImage. }
  OPTIONAL { ?childNode wdt:P18 ?childNodeImage. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],mul,en". }
}`,
      emoji: "🕸️",
      title: "Who {valueLabel} met at other events",
    },
    {
      id: "participantEvents",
      example: "Q140068424",
      scope: "value",
      propertyId: ["P710"],
      valueId: null,
      template: `#defaultView:Timeline
# When this participant appears: every event they are recorded at, on a
# timeline, grouped by the role they appeared in - bride, bridegroom,
# mourner. The role variable is called ?edge because the Timeline view
# groups by ?edgeLabel, and the label service only fills a label variable
# that the SELECT projects by name.
SELECT DISTINCT ?event ?eventLabel ?date ?image ?edgeLabel WHERE {
  ?event p:P710 ?statement.
  ?statement ps:P710 wd:{valueId}.
  # Ceremonies carry a point in time, longer events a start time.
  OPTIONAL { ?event wdt:P585 ?pointInTime. }
  OPTIONAL { ?event wdt:P580 ?startTime. }
  BIND(COALESCE(?pointInTime, ?startTime) AS ?date)
  FILTER(BOUND(?date))
  OPTIONAL { ?statement pq:P3831 ?edge. }
  OPTIONAL { ?event wdt:P18 ?image. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],mul,en". }
}
ORDER BY ?date
LIMIT 300`,
      emoji: "📆",
      title: "Events {valueLabel} took part in, over time",
    },
    {
      id: "seatingChain",
      example: "Q140068424",
      scope: "value",
      propertyId: ["P31"],
      valueId: ["Q63442071","Q49836","Q209715","Q464122","Q626066","Q7603676","Q201676","Q2627975","Q2324916","Q758824"],
      template: `#defaultView:Graph
# The seating as a chain: every participant is linked to the one holding the
# next series ordinal, so the graph reads along the table. The chain is built
# from the ordinals and not from the "follows" / "followed by" qualifiers:
# where the neighbour is an unknown value those qualifiers are anonymous
# blank nodes and carry no link, while the ordinals cover every guest.
SELECT ?node ?nodeLabel ?nodeImage ?childNode ?childNodeLabel ?childNodeImage WHERE {
  wd:{itemId} p:P710 ?statement, ?nextStatement.
  ?statement pq:P1545 ?ordinal.
  ?nextStatement pq:P1545 ?nextOrdinal.
  FILTER(xsd:integer(?nextOrdinal) = xsd:integer(?ordinal) + 1)
  ?statement ps:P710 ?value.
  ?nextStatement ps:P710 ?nextValue.
  OPTIONAL { ?statement pq:P3831 ?eventRole. }
  OPTIONAL { ?statement pq:P39 ?office. }
  OPTIONAL { ?nextStatement pq:P3831 ?nextEventRole. }
  OPTIONAL { ?nextStatement pq:P39 ?nextOffice. }
  BIND(IF(STRSTARTS(STR(?value), "http://www.wikidata.org/entity/"), ?value, ?unnamed) AS ?person)
  BIND(IF(STRSTARTS(STR(?nextValue), "http://www.wikidata.org/entity/"), ?nextValue, ?unnamed) AS ?nextPerson)
  # A named guest is a node of their own item, an attendant recorded as
  # unknown value a node of their statement - so two chamberlains at the same
  # table stay two seats instead of collapsing into one node.
  BIND(COALESCE(?person, ?statement) AS ?node)
  BIND(COALESCE(?nextPerson, ?nextStatement) AS ?childNode)
  # Look the images up from ?value, which is always bound (an unknown guest
  # is a genid IRI and simply has no P18). On the possibly unbound ?person an
  # OPTIONAL would scan every image in the store instead.
  OPTIONAL { ?value wdt:P18 ?nodeImage. }
  OPTIONAL { ?nextValue wdt:P18 ?childNodeImage. }
  # Labelled by hand rather than by SERVICE wikibase:label: the node label has
  # to carry the seat number, and it falls back to the office where the guest
  # has no name of their own. The statement IRI in the last position of the
  # COALESCE only keeps ?who bound - it has no rdfs:label, so such a node ends
  # up labelled "7. ?".
  BIND(COALESCE(?person, ?eventRole, ?office, ?statement) AS ?who)
  BIND(COALESCE(?nextPerson, ?nextEventRole, ?nextOffice, ?nextStatement) AS ?nextWho)
  OPTIONAL { ?who rdfs:label ?whoName. FILTER(LANG(?whoName) = "{userLanguage}") }
  OPTIONAL { ?who rdfs:label ?whoNameMul. FILTER(LANG(?whoNameMul) = "mul") }
  OPTIONAL { ?who rdfs:label ?whoNameEn. FILTER(LANG(?whoNameEn) = "en") }
  OPTIONAL { ?nextWho rdfs:label ?nextName. FILTER(LANG(?nextName) = "{userLanguage}") }
  OPTIONAL { ?nextWho rdfs:label ?nextNameMul. FILTER(LANG(?nextNameMul) = "mul") }
  OPTIONAL { ?nextWho rdfs:label ?nextNameEn. FILTER(LANG(?nextNameEn) = "en") }
  BIND(CONCAT(?ordinal, ". ", COALESCE(?whoName, ?whoNameMul, ?whoNameEn, "?")) AS ?nodeLabel)
  BIND(CONCAT(?nextOrdinal, ". ", COALESCE(?nextName, ?nextNameMul, ?nextNameEn, "?")) AS ?childNodeLabel)
}
LIMIT 200`,
      emoji: "🍽️",
      title: "Who sat next to whom at {itemLabel}",
    },
    {
      id: "seatingOrder",
      example: "Q140068424",
      scope: "value",
      propertyId: ["P31"],
      valueId: ["Q63442071","Q49836","Q209715","Q464122","Q626066","Q7603676","Q201676","Q2627975","Q2324916","Q758824"],
      template: `# Who sat where: every participant of the ceremony in the order the
# protocol records them (series ordinal), with the role they appeared in,
# their rank of precedence, and the guests seated before, after and
# opposite them. On a ceremony without seating qualifiers it degrades to
# the plain participant list with whatever roles are recorded.
SELECT ?seat ?rank ?participant ?participantLabel ?roleLabel ?afterLabel ?beforeLabel ?oppositeLabel WHERE {
  wd:{itemId} p:P710 ?statement.
  ?statement ps:P710 ?value.
  OPTIONAL { ?statement pq:P1545 ?ordinal. }
  OPTIONAL { ?statement pq:P1352 ?ranking. }
  OPTIONAL { ?statement pq:P3831 ?eventRole. }
  OPTIONAL { ?statement pq:P39 ?office. }
  OPTIONAL { ?statement pq:P155 ?afterValue. }
  OPTIONAL { ?statement pq:P156 ?beforeValue. }
  OPTIONAL { ?statement pq:P461 ?oppositeValue. }
  # Attendants known only by their office are modelled as "unknown value",
  # which the store skolemises into a genid IRI. IF() over an unbound
  # variable yields no binding at all, so those cells stay empty instead of
  # showing the genid URI - the role column is what names those people.
  BIND(IF(STRSTARTS(STR(?value), "http://www.wikidata.org/entity/"), ?value, ?unnamed) AS ?participant)
  BIND(IF(STRSTARTS(STR(?afterValue), "http://www.wikidata.org/entity/"), ?afterValue, ?unnamed) AS ?after)
  BIND(IF(STRSTARTS(STR(?beforeValue), "http://www.wikidata.org/entity/"), ?beforeValue, ?unnamed) AS ?before)
  BIND(IF(STRSTARTS(STR(?oppositeValue), "http://www.wikidata.org/entity/"), ?oppositeValue, ?unnamed) AS ?opposite)
  # P3831 carries the role in this event (bride, bridegroom), P39 the office
  # an otherwise unnamed attendant held (chamberlain, envoy).
  BIND(COALESCE(?eventRole, ?office) AS ?role)
  BIND(xsd:integer(?ordinal) AS ?seat)
  BIND(xsd:integer(?ranking) AS ?rank)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],mul,en". }
}
ORDER BY ?seat ?rank
LIMIT 200`,
      emoji: "🪑",
      title: "Seating order at {itemLabel}",
    },
  ];

  const USEFUL_LINKS = [

  ];

  // ===== HELPER FUNCTIONS =====

  /**
   * Replace placeholders in a template string
   * @param {string} template - Template with placeholders like {itemId}, {itemLabel}, etc.
   * @param {Object} replacements - Key-value pairs for replacements
   * @returns {string} Template with placeholders replaced
   */
  function replacePlaceholders(template, replacements) {
    let result = template;
    for (const [key, value] of Object.entries(replacements)) {
      result = result.replaceAll(`{${key}}`, value || "");
    }
    return result;
  }

  /**
   * Encode a query string for use in URLs
   * @param {string} query - The SPARQL query
   * @returns {string} URL-encoded query with # prefix
   */
  function encodeQueryString(query) {
    return "#" + encodeURIComponent(query);
  }

// Build-time SPARQL portability checks for templates/queries/*.json.
//
// The schema checks in validate-templates.mjs catch templates that never show
// up. These catch templates that show up and then time out: every query here is
// also offered as a QLever link, and the two engines plan SPARQL very
// differently. The rules encoded below are the ones written up in TEMPLATE_GUIDE.md
// under "Writing the SPARQL".
//
// These are deliberately syntactic. They are not a SPARQL parser and cannot
// judge selectivity — they pin the three mistakes that have actually shipped.

/**
 * Strip `#` comments, ignoring `#` inside string literals.
 * @param {string} line
 * @returns {string}
 */
function stripComment(line) {
  let inStr = false;
  let quote = "";
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inStr) {
      if (c === quote && line[i - 1] !== "\\") inStr = false;
    } else if (c === '"' || c === "'") {
      inStr = true;
      quote = c;
    } else if (c === "#") {
      return line.slice(0, i);
    }
  }
  return line;
}

/**
 * Split a graph pattern body into top-level statements.
 *
 * Splits on `.` only outside strings, brackets and decimal numbers. `;` is not
 * a split point: it continues the same subject, so those triples are connected
 * by definition.
 * @param {string} body
 * @returns {string[]}
 */
function splitStatements(body) {
  const out = [];
  let cur = "";
  let depth = 0;
  let inStr = false;
  let quote = "";
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (inStr) {
      cur += c;
      if (c === quote && body[i - 1] !== "\\") inStr = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = true;
      quote = c;
      cur += c;
      continue;
    }
    if (c === "(" || c === "{" || c === "[") depth++;
    if (c === ")" || c === "}" || c === "]") depth--;
    if (
      c === "." &&
      depth === 0 &&
      !(/\d/.test(body[i - 1] ?? "") && /\d/.test(body[i + 1] ?? ""))
    ) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean);
}

/**
 * Find every `OPTIONAL { … }` block, matching braces so nested blocks survive.
 * @param {string} query
 * @returns {{body: string, index: number}[]}
 */
function findOptionalBlocks(query) {
  const blocks = [];
  const re = /\bOPTIONAL\s*\{/gi;
  let m;
  while ((m = re.exec(query)) !== null) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    for (; i < query.length && depth > 0; i++) {
      if (query[i] === "{") depth++;
      else if (query[i] === "}") depth--;
    }
    if (depth === 0) blocks.push({ body: query.slice(start, i - 1), index: m.index });
  }
  return blocks;
}

function variablesIn(text) {
  return new Set((text.match(/\?[A-Za-z_][A-Za-z0-9_]*/g) ?? []));
}

/**
 * Group statements into components that share at least one variable.
 * @param {string[]} statements
 * @returns {string[][]}
 */
function connectedComponents(statements) {
  const vars = statements.map(variablesIn);
  const parent = statements.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < statements.length; i++) {
    for (let j = i + 1; j < statements.length; j++) {
      if ([...vars[i]].some((v) => vars[j].has(v))) parent[find(i)] = find(j);
    }
  }
  const groups = new Map();
  statements.forEach((s, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(s);
  });
  return [...groups.values()];
}

// Lines that may legally follow the label service inside/after the WHERE clause.
const TAIL_RE =
  /^\s*(\}|\)|ORDER\s+BY\b|GROUP\s+BY\b|HAVING\b|LIMIT\b|OFFSET\b|BINDINGS\b|VALUES\b)/i;

/**
 * Rule: `SERVICE wikibase:label` must be the last pattern in the WHERE clause.
 * @param {string[]} lines
 * @returns {string[]}
 */
function checkLabelServiceLast(lines) {
  // Comment-stripped: a comment that only talks about the label service, in a
  // query that labels by hand, is not a label service call.
  const svc = lines.findIndex((l) => /SERVICE\s+wikibase:label/i.test(stripComment(l)));
  if (svc === -1) return [];
  const offenders = [];
  for (let i = svc + 1; i < lines.length; i++) {
    const line = stripComment(lines[i]).trim();
    if (!line || TAIL_RE.test(line)) continue;
    offenders.push(`line ${i + 1}: ${line}`);
  }
  return offenders.length
    ? [
        "SERVICE wikibase:label must be the last pattern in the WHERE clause " +
          `(the QLever converter places its rdfs:label blocks from what it sees before it); ` +
          `found ${offenders.length} pattern(s) after it, first is ${offenders[0]}`,
      ]
    : [];
}

/**
 * Rule: an OPTIONAL body must not contain patterns that share no variable —
 * QLever materialises the cross product of the two relations.
 * @param {string} query
 * @returns {string[]}
 */
function checkOptionalsConnected(query) {
  const errors = [];
  for (const { body } of findOptionalBlocks(query)) {
    const statements = splitStatements(body).filter((s) => variablesIn(s).size);
    if (statements.length < 2) continue;
    const groups = connectedComponents(statements);
    if (groups.length > 1) {
      errors.push(
        `OPTIONAL { ${statements.join(" . ")} } holds ${groups.length} pattern groups ` +
          `that share no variable — split it into one OPTIONAL per group ` +
          `(QLever materialises the cross product)`,
      );
    }
  }
  return errors;
}

/**
 * Rule: the same OPTIONAL body must not appear twice — that is the per-UNION-arm
 * duplication that should be hoisted below the UNION instead.
 * @param {string} query
 * @returns {string[]}
 */
function checkNoDuplicateOptionals(query) {
  const seen = new Map();
  for (const { body } of findOptionalBlocks(query)) {
    const key = splitStatements(body).join(" . ");
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen.entries()]
    .filter(([, n]) => n > 1)
    .map(
      ([key, n]) =>
        `OPTIONAL { ${key} } appears ${n} times — hoist a single copy below the ` +
        `UNION instead of repeating it per arm`,
    );
}

/**
 * Run every SPARQL portability check over one query template's lines.
 * @param {string[]} lines - The `template` array of a query template
 * @returns {string[]} Human-readable problems; empty means clean.
 */
function checkSparql(lines) {
  const query = lines.map(stripComment).join("\n");
  return [
    ...checkLabelServiceLast(lines),
    ...checkOptionalsConnected(query),
    ...checkNoDuplicateOptionals(query),
  ];
}

// Build-time validation for templates/queries/*.json and templates/links/*.json.
//
// Templates are hand-written JSON that gets inlined into the shipped script. A
// malformed one produces no build error and no runtime error — the button just
// silently never appears. These checks turn that into a failed build instead.


const SCOPES = ["entity", "property", "value"];

// Placeholders replaced by replacePlaceholders() in src/helpers.js. Anything
// else survives into the SPARQL query / URL verbatim and breaks it.
// Naming: `…Id` is always a bare entity ID (Q42, P19) that you prefix yourself
// (wd:{itemId}); `valueSparql` is the one that is already a SPARQL term.
const BASE_PLACEHOLDERS = ["itemId", "itemLabel", "userLanguage"];
// The property the button is attached to. Only bound for scope "property" and
// "value" — an entity-scope button hangs off the title and matched no property.
const PROPERTY_PLACEHOLDERS = ["propertyId"];
// valueId is empty unless the value is an item/property; valueLatitude /
// valueLongitude are only filled for globe-coordinate values (P625 and
// friends); on any other datatype they resolve to an empty string.
const VALUE_PLACEHOLDERS = [
  "valueId",
  "valueSparql",
  "valueLabel",
  "valueLatitude",
  "valueLongitude",
];

// The statement a qualifier or reference belongs to. Only bound for templates
// with "section": "qualifiers" or "references".
const STATEMENT_PLACEHOLDERS = [
  "statementPropertyId",
  "statementValueId",
  "statementValueSparql",
  "statementValueLabel",
];

// Where on a statement a property/value template hangs. Omitted = "statement",
// the statement's own value.
const SECTIONS = ["statement", "qualifiers", "references"];

// One-line help per placeholder, shown as tooltips in the button editor.
// In triple terms: the item is the subject, the property the predicate and the
// statement's value the object.
const PLACEHOLDER_HELP = {
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
function validateTemplate(tpl, kind, options = {}) {
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
function assertTemplatesValid(loaded, kind, label) {
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

// Per-user configuration: the pure part.
//
// A user's choices live on a JSON page in their own user space,
// User:<name>/<configName>.json (only the owner and interface admins can edit
// it). This module parses, validates and merges that page and holds the
// helpers the editor needs. It touches no DOM and no mw.* API, so the tests
// import it directly; the build strips the `import`/`export` keywords and
// inlines it into the shipped script, like validate-templates.mjs.


const CONFIG_VERSION = 1;

// Prefix for ids of user-made templates, so they never collide with built-ins.
const USER_ID_PREFIX = "u_";

/**
 * A fresh config. `seen` lists the built-in ids the user has been shown, so a
 * built-in added in a later release can be flagged as new on the settings page.
 * @param {string[]} [builtinIds]
 */
function emptyConfig(builtinIds = []) {
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
function validateUserConfig(raw, builtinIds = []) {
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
function parseUserConfig(text, builtinIds = []) {
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
function serializeConfig(config) {
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
function toRuntimeTemplate(tpl) {
  return Array.isArray(tpl.template) ? { ...tpl, template: tpl.template.join("\n") } : tpl;
}

/**
 * The templates that should be active: built-ins minus the disabled ones,
 * followed by the user's own.
 * @param {object[]} builtins - Built-in templates (runtime form)
 * @param {object[]} userTemplates - User templates (JSON form)
 * @param {string[]} disabled - Built-in ids the user switched off
 */
function mergeTemplates(builtins, userTemplates, disabled) {
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
function queryFromServiceUrl(url) {
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
function generalizeQuery(text, ctx) {
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
function removeTemplate(config, id) {
  config.queries = config.queries.filter((t) => t.id !== id);
  config.links = config.links.filter((t) => t.id !== id);
}

/**
 * A new id for a user template, unique among `existingIds`.
 * @param {string} title - Used to make the id readable in the JSON page
 * @param {Iterable<string>} existingIds
 */
function makeTemplateId(title, existingIds) {
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
function importTemplates(config, picked, builtinIds = []) {
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
function suggestionIssueUrl(tpl, kind, repoUrl) {
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

// ===== QLEVER =====

/**
 * Build a "To QLever" link for a query. The Toolforge tool
 * (https://to-qlever.toolforge.org/) parses the WDQS query, rewrites the
 * Blazegraph-specific parts (label service, named subqueries, query hints,
 * missing prefixes) and redirects to QLever with the converted query.
 * The build turns enableQLever off for every wiki but Wikidata.
 * @param {string} querystring - The encoded query string (starts with "#")
 * @returns {string|null} To QLever URL, or null if disabled
 */
function getQLeverUrl(querystring) {
  if (!SETTINGS.enableQLever) return null;
  const queryServiceHref = SETTINGS.queryServiceUrl + querystring;
  return SETTINGS.toQLeverUrl + "?url=" + encodeURIComponent(queryServiceHref);
}

// ===== UI CREATION FUNCTIONS =====

// Buttons are collected while the claims are processed and rendered together
// by mountButtons(): one Vue app per build instead of one per button.
const _pendingButtons = [];

// What is currently on the page, so it can be torn down and rebuilt when the
// active templates or edit mode change.
const _mounted = { app: null, mountPoint: null, slots: [], generation: 0, styled: false };

const BUTTON_CSS =
  ".usefulqueries-popover { max-width: none !important; }" +
  ".usefulqueries-add .cdx-button, .usefulqueries-edit .cdx-button { min-width: 0; padding: 0 4px; opacity: .75; }" +
  ".usefulqueries-add .cdx-button { border: 1px dashed currentColor; }";

/**
 * Append an empty slot to an anchor element; the button is teleported into it
 * later, so it keeps its position among the other buttons on that anchor.
 * @param {jQuery} element - The element to append the slot to
 * @returns {HTMLElement} The slot element
 */
function addButtonSlot(element) {
  const slot = document.createElement("span");
  slot.className = "usefulqueries-slot";
  $(element).append(slot);
  _mounted.slots.push(slot);
  return slot;
}

/**
 * Queue a Codex button with a link
 * @param {jQuery} element - The element to append the button to
 * @param {string} url - The URL to open when clicked
 * @param {string} buttonLabel - The label (emoji/text) for the button
 * @param {string} title - The tooltip for the button
 * @param {{kind: string, id: string}} [ref] - The template behind the button
 */
function createLinkButton(element, url, buttonLabel, title, ref) {
  _pendingButtons.push({
    kind: "link",
    slot: addButtonSlot(element),
    url,
    buttonLabel,
    title,
    ref: ref || null,
  });
}

/**
 * Queue an edit-mode "+" button that opens the editor for this spot.
 * @param {jQuery} element - The anchor element
 * @param {Object} target - Where a new button would go (scope, propertyId, value)
 */
function createAddSlot(element, target) {
  _pendingButtons.push({
    kind: "add",
    slot: addButtonSlot(element),
    target,
  });
}

/** Remove every button this script put on the page. */
function clearButtons() {
  if (_mounted.app) {
    _mounted.app.unmount();
    _mounted.mountPoint.remove();
    _mounted.app = null;
    _mounted.mountPoint = null;
  }
  _mounted.slots.forEach((slot) => slot.remove());
  _mounted.slots = [];
  _pendingButtons.length = 0;
  // Invalidates a mountButtons() still waiting for Codex.
  _mounted.generation++;
}

/**
 * Queue a Codex popup button with an embedded query
 * @param {jQuery} element - The element to append the popup button to
 * @param {string} querystring - The encoded query string
 * @param {string} buttonLabel - The label (emoji/text) for the button
 * @param {string} title - The tooltip and popup heading
 * @param {string} scope - Template scope ("entity", "property", or "value")
 * @param {{kind: string, id: string}} [ref] - The template behind the button
 */
function createQueryPopup(
  element,
  querystring,
  buttonLabel,
  title,
  scope,
  ref,
) {
  _pendingButtons.push({
    kind: "popup",
    slot: addButtonSlot(element),
    buttonLabel,
    title,
    queryServiceHref: SETTINGS.queryServiceUrl + querystring,
    embedHref: SETTINGS.queryEmbedUrl + querystring,
    qleverHref: getQLeverUrl(querystring),
    placement: (scope === "value") ? "bottom" : "bottom-start",
    ref: ref || null,
  });
}

/**
 * Popover button for one query. Each instance keeps its own open state and
 * only creates its iframe while open.
 */
const UsefulQueriesPopover = {
  name: "UsefulQueriesPopover",
  props: {
    button: { type: Object, required: true },
    iframeSize: { type: Number, required: true },
  },
  data: function () {
    return {
      open: false,
      anchorEl: null,
      primaryAction: {
        label: "Open in query service",
        actionType: "progressive",
      },
      defaultAction: this.button.qleverHref ? { label: "Open in QLever" } : null,
    };
  },
  mounted: function () {
    this.anchorEl = this.$refs.triggerEl || null;
  },
  methods: {
    openQueryService: function () {
      window.open(this.button.queryServiceHref, "_blank", "noopener,noreferrer");
    },
    openQLever: function () {
      if (this.button.qleverHref) {
        window.open(this.button.qleverHref, "_blank", "noopener,noreferrer");
      }
    },
  },
  template: `
      <span ref="triggerEl">
        <cdx-button
          weight="quiet"
          action="progressive"
          :aria-label="button.title"
          :title="button.title"
          @click="$event.preventDefault(); open = !open"
        >
          {{ button.buttonLabel }}
        </cdx-button>
      </span>

      <cdx-popover
        v-if="anchorEl"
        v-model:open="open"
        :anchor="anchorEl"
        :placement="button.placement"
        :render-in-place="false"
        :title="button.title"
        :use-close-button="true"
        :use-bottom-sheet="true"
        :primary-action="primaryAction"
        :default-action="defaultAction"
        class="usefulqueries-popover"
        style="z-index: 999;"
        @primary="openQueryService"
        @default="openQLever"
      >
        <iframe
          v-if="open"
          scrolling="yes"
          frameborder="0"
          :src="button.embedHref"
          :width="iframeSize"
          :height="iframeSize"
        ></iframe>
      </cdx-popover>
    `,
};

/**
 * Load Vue and Codex, and check that the given Codex components exist (older
 * wikis, e.g. some Wikibase Cloud instances, ship an older Codex).
 * @param {string[]} components - Component names, e.g. ["CdxDialog"]
 * @param {string[]} [modules] - Further ResourceLoader modules to load
 * @returns {Promise<{Vue: Object, Codex: Object, missing: string|null}>}
 *   `missing` is a message for the user when components are absent, else null
 */
function loadCodex(components, modules = []) {
  return mw.loader.using(["@wikimedia/codex", ...modules]).then(function (require) {
    const Codex = require("@wikimedia/codex");
    const absent = components.filter((name) => !Codex[name]);
    return {
      Vue: require("vue"),
      Codex,
      missing: absent.length
        ? "This needs a newer version of Codex than this wiki has (missing " +
          absent.join(", ") + "). You can still edit " + configPageTitle() + " by hand."
        : null,
    };
  });
}

/**
 * Render all queued buttons with a single Vue app that teleports each button
 * into its slot.
 */
function mountButtons() {
  // A slot whose anchor was not found never made it into the page; teleporting
  // into it would render nothing, so leave those buttons out.
  const buttons = _pendingButtons.splice(0).filter((b) => b.slot.isConnected);
  if (!buttons.length) return;
  const generation = _mounted.generation;
  const editMode = _editMode;
  const userIds = new Set(
    _userConfig ? [..._userConfig.queries, ..._userConfig.links].map((t) => t.id) : [],
  );
  for (const b of buttons) {
    b.isUser = !!(b.ref && userIds.has(b.ref.id));
  }

  mw.loader.using("@wikimedia/codex").then(function (require) {
    // Torn down (e.g. edit mode toggled) before Codex finished loading.
    if (generation !== _mounted.generation) return;
    const Vue = require("vue");
    const Codex = require("@wikimedia/codex");

    if (!_mounted.styled) {
      mw.util.addCSS(BUTTON_CSS);
      _mounted.styled = true;
    }

    if (!Codex.CdxPopover) {
      // Older Codex versions (e.g. some Wikibase Cloud instances) lack CdxPopover;
      // fall back to plain link buttons to avoid rendering the component inline.
      for (const b of buttons) {
        if (b.kind === "popup") {
          b.kind = "link";
          b.url = b.queryServiceHref;
        }
      }
    }

    const mountPoint = document.createElement("div");
    mountPoint.hidden = true;
    document.body.appendChild(mountPoint);

    const app = Vue.createMwApp({
      name: "UsefulQueriesButtons",
      data: function () {
        return {
          // Static list holding DOM nodes; keep Vue from proxying it.
          buttons: Vue.markRaw(buttons),
          editMode,
          iframeSize: Math.min(Math.max(window.innerWidth - 40, 400), 800),
        };
      },
      methods: {
        add: function (b) {
          openTemplateEditor(b.target, null);
        },
        editOrHide: function (b) {
          if (b.isUser) {
            openTemplateEditor(null, b.ref);
          } else {
            hideBuiltinButton(b.ref, b.title);
          }
        },
      },
      template: `
          <template v-for="(b, i) in buttons" :key="i">
            <teleport :to="b.slot">
              <span v-if="b.kind === 'add'" class="usefulqueries-add">
                <cdx-button
                  weight="quiet"
                  aria-label="Add a usefulQueries button here"
                  title="Add a usefulQueries button here"
                  @click="add(b)"
                >+</cdx-button>
              </span>
              <a
                v-else-if="b.kind === 'link'"
                :href="b.url"
                target="_blank"
                rel="noopener noreferrer"
                :title="b.title"
                style="text-decoration: none;"
              >
                <cdx-button weight="quiet" action="progressive" :aria-label="b.title">
                  {{ b.buttonLabel }}
                </cdx-button>
              </a>
              <useful-queries-popover
                v-else
                :button="b"
                :iframe-size="iframeSize"
              ></useful-queries-popover>
              <span v-if="editMode && b.ref" class="usefulqueries-edit">
                <cdx-button
                  weight="quiet"
                  :action="b.isUser ? 'progressive' : 'destructive'"
                  :aria-label="b.isUser ? 'Edit this button' : 'Hide this button'"
                  :title="b.isUser ? 'Edit this button' : 'Hide this built-in button (bring it back in usefulQueries settings)'"
                  @click="editOrHide(b)"
                >{{ b.isUser ? "✎" : "✕" }}</cdx-button>
              </span>
            </teleport>
          </template>
        `,
    });

    app.component("CdxButton", Codex.CdxButton);
    if (Codex.CdxPopover) {
      app.component("CdxPopover", Codex.CdxPopover);
    }
    app.component("UsefulQueriesPopover", UsefulQueriesPopover);
    app.mount(mountPoint);
    _mounted.app = app;
    _mounted.mountPoint = mountPoint;
  });
}

// ===== DOM HELPER FUNCTIONS =====

/**
 * Get the DOM element for a property group by property ID
 * @param {string} propertyId - The property ID (e.g., "P106")
 * @returns {jQuery|null} The property label element or null if not found
 */
function getPropertyElement(propertyId) {
  // Desktop
  const $propertyLink = $(
    '.wikibase-statementgroupview-property-label a[title="Property:' +
      propertyId +
      '"]',
  );
  if ($propertyLink.length) {
    return $propertyLink.closest(".wikibase-statementgroupview-property-label");
  }
  // Mobile (wbui2025): only match the heading row, not property names inside references
  const $mobileLink = $(
    '.wikibase-wbui2025-statement-heading .wikibase-wbui2025-property-name-link[data-property-id="' +
      propertyId +
      '"]',
  );
  if ($mobileLink.length) {
    return $mobileLink.closest(".wikibase-wbui2025-property-name");
  }
  return null;
}

/**
 * Element next to which entity-level buttons go.
 * Desktop: the "(Q42)" after the label. Mobile (wbui2025): the primary label,
 * which is an <h2> when the item has a label and a <div> ("No label defined")
 * when it has none. The page heading is the last resort, so the buttons never
 * end up in a detached element.
 * @returns {jQuery} Possibly empty if the page has none of these
 */
function getTitleElement() {
  for (const selector of [
    ".wikibase-title .wikibase-title-id",
    ".wb-ui-label--primary",
    "#firstHeading",
  ]) {
    const $el = $(selector).first();
    if ($el.length) return $el;
  }
  return $();
}

/**
 * The item's label for {itemLabel}, from the entity data rather than the page
 * (which shows "No label defined" when there is none). Follows the user's
 * language fallback chain, then "mul", then any label; falls back to the ID.
 * @param {Object} entityData - From wikibase.entityPage.entityLoaded
 * @param {string} userLanguage
 * @returns {string}
 */
function getItemLabel(entityData, userLanguage) {
  const labels = entityData.labels || {};
  const chain =
    mw.language && mw.language.getFallbackLanguageChain
      ? mw.language.getFallbackLanguageChain()
      : [userLanguage, "en"];
  for (const lang of [userLanguage, ...chain, "mul"]) {
    if (labels[lang] && labels[lang].value) return labels[lang].value;
  }
  const any = Object.values(labels).find((l) => l && l.value);
  return any ? any.value : entityData.id;
}

/**
 * Get the DOM element for a specific statement by statement ID
 * @param {string} statementId - The full statement ID
 * @returns {jQuery|null} The statement element or null if not found
 */
function getStatementElement(statementId) {
  const $statement = $("#" + CSS.escape(statementId));
  return $statement.length ? $statement : null;
}

/**
 * Get the indicator element for a statement where buttons can be attached
 * @param {jQuery} $statementElement - The statement element
 * @returns {jQuery|null} The indicator element or null if not found
 */
function getStatementIndicatorElement($statementElement) {
  // Desktop
  const $desktop = $statementElement.find(".wikibase-snakview-indicators").first();
  if ($desktop.length) return $desktop;
  // Mobile (wbui2025)
  return $statementElement
    .find(".wikibase-wbui2025-main-snak .wikibase-wbui2025-snak-value")
    .first();
}

/**
 * Extract the displayed label text from a statement's main value in the DOM
 * @param {jQuery} $statementElement - The statement element
 * @returns {string|null} The label text or null if not found
 */
function getStatementValueLabel($statementElement) {
  // Desktop
  const $desktop = $statementElement.find(".wikibase-snakview-value a").first();
  if ($desktop.length) return $desktop.text().trim() || null;
  // Mobile (wbui2025)
  const $mobile = $statementElement
    .find(".wikibase-wbui2025-main-snak .wikibase-wbui2025-snak-value .snakValue a")
    .first();
  if ($mobile.length) return $mobile.text().trim() || null;
  return null;
}

// --- Qualifiers and references ---
// Desktop renders each snak as .wikibase-snakview-<hash>; the property label is
// only filled on the first snak of each property. Mobile (wbui2025) renders
// qualifiers as .wikibase-wbui2025-qualifier rows whose value carries
// data-snak-hash. Mobile references are only rendered once expanded, so they
// get no buttons there.

/**
 * The element holding a statement's qualifiers.
 * @param {jQuery} $statementElement
 * @returns {jQuery|null}
 */
function getQualifiersElement($statementElement) {
  const $el = $statementElement
    .find(".wikibase-statementview-qualifiers, .wikibase-wbui2025-qualifiers")
    .first();
  return $el.length ? $el : null;
}

/**
 * The element of one reference of a statement (desktop only).
 * @param {jQuery} $statementElement
 * @param {string} hash - The reference hash from the entity data
 * @returns {jQuery|null}
 */
function getReferenceElement($statementElement, hash) {
  const $el = $statementElement.find(".wikibase-referenceview-" + hash).first();
  return $el.length ? $el : null;
}

/**
 * One qualifier or reference snak inside its container.
 * @param {jQuery} $container - From getQualifiersElement / getReferenceElement
 * @param {string} hash - The snak hash from the entity data
 * @returns {jQuery|null}
 */
function getSnakElement($container, hash) {
  let $el = $container.find(".wikibase-snakview-" + hash).first();
  if (!$el.length) $el = $container.find('[data-snak-hash="' + hash + '"]').first();
  return $el.length ? $el : null;
}

/**
 * The property label shown for a snak (pass the first snak of a property).
 * @param {jQuery} $container
 * @param {string} hash
 * @returns {jQuery|null}
 */
function getSnakPropertyElement($container, hash) {
  const $snak = getSnakElement($container, hash);
  if (!$snak) return null;
  // Desktop
  let $el = $snak.find(".wikibase-snakview-property").first();
  // Mobile
  if (!$el.length) {
    $el = $snak.closest(".wikibase-wbui2025-qualifier").find(".wikibase-wbui2025-property-name").first();
  }
  return $el.length ? $el : null;
}

/**
 * Where value buttons go on a qualifier/reference snak.
 * @param {jQuery} $snak - From getSnakElement
 * @returns {jQuery}
 */
function getSnakIndicatorElement($snak) {
  const $desktop = $snak.find(".wikibase-snakview-indicators").first();
  return $desktop.length ? $desktop : $snak;
}

/**
 * Displayed label of a qualifier/reference value.
 * @param {jQuery} $snak
 * @returns {string|null}
 */
function getSnakValueLabel($snak) {
  const $a = $snak.find(".wikibase-snakview-value a, .snakValue a").first();
  return $a.length ? $a.text().trim() || null : null;
}

/**
 * Extract value details from a claim's mainsnak
 * @param {Object} mainsnak - The mainsnak object from the claim
 * @returns {{value: string|null, label: string|null, entityId?: string, latitude?: string, longitude?: string}} Value details
 *   (`value` is the raw form used to match valueId: Q64 for items, the SPARQL term otherwise)
 */
function extractValueFromMainsnak(mainsnak) {
  if (!mainsnak || mainsnak.snaktype !== "value" || !mainsnak.datavalue) {
    return { value: null, label: null };
  }

  const datavalue = mainsnak.datavalue;

  switch (datavalue.type) {
    case "wikibase-entityid":
      return { value: datavalue.value.id, label: null, entityId: datavalue.value.id };
    case "time":
      return {
        value: '"' + datavalue.value.time + '"^^xsd:dateTime',
        label: datavalue.value.time,
      };
    case "quantity":
      return { value: datavalue.value.amount, label: datavalue.value.amount };
    case "string":
      return { value: '"' + datavalue.value + '"', label: datavalue.value };
    case "globecoordinate": {
      // Kept as strings so that a latitude/longitude of exactly 0 survives the
      // falsy check in replacePlaceholders().
      const lat = String(datavalue.value.latitude);
      const lon = String(datavalue.value.longitude);
      return {
        value: '"Point(' + lon + " " + lat + ')"^^geo:wktLiteral',
        label: lat + ", " + lon,
        latitude: lat,
        longitude: lon,
      };
    }
    default:
      return { value: null, label: null };
  }
}

// ===== PROCESSING FUNCTIONS =====

// Where on a statement a template hangs: the statement's own (main) value, one
// of its qualifiers, or a snak inside one of its references (SECTIONS, from
// validate-templates.mjs).

/** The section of a template; templates without one are on the statement. */
function sectionOf(template) {
  return template.section || "statement";
}

// Pre-built lookup indexes — avoids full-array scans on every property/claim.
// Keys are "<scope>:<section>:<propertyId>". Rebuilt by setActiveTemplates()
// once the user's config is known, and again whenever it changes.
function buildTemplateIndex(templates) {
  const entity = [];
  const byKey = new Map();
  const sections = new Set();
  for (const t of templates) {
    if (t.scope === "entity") {
      entity.push(t);
    } else {
      sections.add(sectionOf(t));
      const ids = Array.isArray(t.propertyId) ? t.propertyId : [t.propertyId];
      for (const id of ids) {
        const key = templateKey(t.scope, sectionOf(t), id);
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(t);
      }
    }
  }
  return { entity, byKey, sections };
}

function templateKey(scope, section, propertyId) {
  return scope + ":" + section + ":" + propertyId;
}

let _templateIndex = {
  queries: buildTemplateIndex(USEFUL_QUERIES),
  links: buildTemplateIndex(USEFUL_LINKS),
};

/**
 * Replace the active templates (built-ins minus hidden ones, plus the user's).
 * @param {Object[]} queries - Query templates in runtime form
 * @param {Object[]} links - Link templates
 */
function setActiveTemplates(queries, links) {
  _templateIndex = {
    queries: buildTemplateIndex(queries),
    links: buildTemplateIndex(links),
  };
}

/** Whether any active template hangs at scope/section/propertyId. */
function hasTemplates(scope, section, propertyId) {
  const key = templateKey(scope, section, propertyId);
  return _templateIndex.queries.byKey.has(key) || _templateIndex.links.byKey.has(key);
}

/** Whether any active template hangs inside qualifiers or references. */
function hasSectionTemplates(section) {
  return _templateIndex.queries.sections.has(section) || _templateIndex.links.sections.has(section);
}

// In edit mode every anchor also gets a "+" button, and every button an
// edit/hide control. Toggled from the Tools menu.
let _editMode = false;

/**
 * Placeholder values for a button on one value (a statement's main value, a
 * qualifier value or a reference value).
 * @param {Object} context - Placeholders known so far (item, and for
 *   qualifiers/references the statement ones)
 * @param {string} propertyId - The property of this value
 * @param {{value: string, label: ?string, entityId?: string, latitude?: string, longitude?: string}} valueDetails
 * @returns {Object} All placeholders available on scope "value"
 */
function valuePlaceholders(context, propertyId, valueDetails) {
  return {
    ...context,
    propertyId,
    // Bare ID for item/property values (write wd:{valueId}); empty otherwise.
    valueId: valueDetails.entityId || "",
    // Any datatype, already written as a SPARQL term (wd:Q64, "91E23", …).
    valueSparql: sparqlTerm(valueDetails),
    valueLabel: valueDetails.label || valueDetails.value || "",
    // Only set for globe-coordinate values (e.g. P625); empty elsewhere.
    valueLatitude: valueDetails.latitude || "",
    valueLongitude: valueDetails.longitude || "",
  };
}

/**
 * Placeholders describing the statement a qualifier or reference belongs to.
 * @param {Object} context - Item-level placeholders
 * @param {string} propertyId - The statement's property
 * @param {Object} mainValue - Details of the statement's main value
 */
function statementPlaceholders(context, propertyId, mainValue) {
  return {
    ...context,
    statementPropertyId: propertyId,
    statementValueId: mainValue.entityId || "",
    statementValueSparql: sparqlTerm(mainValue),
    statementValueLabel: mainValue.label || mainValue.value || "",
  };
}

function sparqlTerm(valueDetails) {
  if (valueDetails.entityId) return "wd:" + valueDetails.entityId;
  return valueDetails.value || "";
}

function matchesValueId(valueId, configValueId) {
  if (!configValueId || configValueId.length === 0) return true;
  return configValueId.includes(valueId);
}

/**
 * Queue the buttons of every template at scope/section/propertyId, plus the
 * edit-mode "+" for that spot.
 * @param {jQuery} $anchor - Where the buttons go
 * @param {string} scope - "entity", "property" or "value"
 * @param {string} section - "statement", "qualifiers" or "references"
 * @param {string|null} propertyId - null for scope "entity"
 * @param {Object} placeholders - Values for replacePlaceholders()
 * @param {string|null} value - The raw value, matched against valueId; null for
 *   property/entity buttons
 * @param {Object} target - Describes this spot to the editor
 * @param {Set<string>} [shown] - Template ids already shown in this block;
 *   these are skipped and new ones added (one button per template per block)
 */
function addButtons($anchor, scope, section, propertyId, placeholders, value, target, shown) {
  const key = templateKey(scope, section, propertyId);
  const queries =
    scope === "entity" ? _templateIndex.queries.entity : (_templateIndex.queries.byKey.get(key) ?? []);
  const links =
    scope === "entity" ? _templateIndex.links.entity : (_templateIndex.links.byKey.get(key) ?? []);

  const fresh = (t) => {
    if (!shown) return true;
    if (shown.has(t.id)) return false;
    shown.add(t.id);
    return true;
  };

  for (const query of queries) {
    if (value !== null && !matchesValueId(value, query.valueId)) continue;
    if (!fresh(query)) continue;
    createQueryPopup(
      $anchor,
      encodeQueryString(replacePlaceholders(query.template, placeholders)),
      query.emoji,
      replacePlaceholders(query.title, placeholders),
      scope,
      { kind: "query", id: query.id },
    );
  }
  for (const link of links) {
    if (value !== null && !matchesValueId(value, link.valueId)) continue;
    if (!fresh(link)) continue;
    createLinkButton(
      $anchor,
      replacePlaceholders(link.urlTemplate, placeholders),
      link.emoji,
      replacePlaceholders(link.title, placeholders),
      { kind: "link", id: link.id },
    );
  }

  if (_editMode) createAddSlot($anchor, target);
}

/**
 * Process entity-level features (attached to the entity title)
 * @param {jQuery} $titleElement - The title element
 * @param {Object} context - Context with itemId, itemLabel, userLanguage
 */
function processEntityFeatures($titleElement, context) {
  addButtons($titleElement, "entity", "statement", null, context, null, { scope: "entity" });
}

/**
 * Buttons for the qualifiers or the snaks of one reference of a statement.
 * @param {jQuery} $container - Element holding these snaks
 * @param {Object<string, Object[]>} snaks - Snaks by property
 * @param {string[]} order - Property order as shown
 * @param {string} section - "qualifiers" or "references"
 * @param {Object} context - Item and statement placeholders
 * @param {Object} statement - {propertyId, value} of the owning statement, for the editor
 */
function processSnaks($container, snaks, order, section, context, statement) {
  const all = _editMode;
  // A property template listing several qualifiers (replaces + replaced by)
  // would otherwise appear once per qualifier of the same statement.
  const shownPropertyTemplates = new Set();
  for (const propertyId of order) {
    const list = snaks[propertyId] || [];
    if (!list.length) continue;

    if (all || hasTemplates("property", section, propertyId)) {
      const $label = getSnakPropertyElement($container, list[0].hash);
      if ($label) {
        addButtons(
          $label,
          "property",
          section,
          propertyId,
          { ...context, propertyId },
          null,
          { scope: "property", section, propertyId, statement },
          shownPropertyTemplates,
        );
      }
    }

    if (all || hasTemplates("value", section, propertyId)) {
      for (const snak of list) {
        const valueDetails = extractValueFromMainsnak(snak);
        if (!valueDetails.value) continue;
        const $snak = getSnakElement($container, snak.hash);
        if (!$snak) continue;
        if (valueDetails.label === null) valueDetails.label = getSnakValueLabel($snak);
        addButtons(
          getSnakIndicatorElement($snak),
          "value",
          section,
          propertyId,
          valuePlaceholders(context, propertyId, valueDetails),
          valueDetails.value,
          { scope: "value", section, propertyId, value: valueDetails, statement },
        );
      }
    }
  }
}

/**
 * Process a single claim (statement) from the entity data
 * @param {string} propertyId - The property ID
 * @param {Object} claim - The claim object from entityData.claims
 * @param {Object} context - Context with itemId, itemLabel, userLanguage
 * @param {{main: boolean, qualifiers: boolean, references: boolean}} wanted
 */
function processClaim(propertyId, claim, context, wanted) {
  const $statementElement = getStatementElement(claim.id);
  if (!$statementElement) return;

  const valueDetails = extractValueFromMainsnak(claim.mainsnak);
  if (valueDetails.value && valueDetails.label === null) {
    valueDetails.label = getStatementValueLabel($statementElement);
  }

  if (wanted.main && valueDetails.value) {
    const $indicatorElement = getStatementIndicatorElement($statementElement);
    if ($indicatorElement && $indicatorElement.length) {
      addButtons(
        $indicatorElement,
        "value",
        "statement",
        propertyId,
        valuePlaceholders(context, propertyId, valueDetails),
        valueDetails.value,
        { scope: "value", section: "statement", propertyId, value: valueDetails },
      );
    }
  }

  if (!wanted.qualifiers && !wanted.references) return;
  const statementContext = statementPlaceholders(context, propertyId, valueDetails);
  const statement = { propertyId, value: valueDetails };

  if (wanted.qualifiers && claim.qualifiers) {
    const $qualifiers = getQualifiersElement($statementElement);
    if ($qualifiers) {
      processSnaks(
        $qualifiers,
        claim.qualifiers,
        claim["qualifiers-order"] || Object.keys(claim.qualifiers),
        "qualifiers",
        statementContext,
        statement,
      );
    }
  }

  if (wanted.references && claim.references) {
    for (const reference of claim.references) {
      const $reference = getReferenceElement($statementElement, reference.hash);
      if (!$reference) continue;
      processSnaks(
        $reference,
        reference.snaks,
        reference["snaks-order"] || Object.keys(reference.snaks),
        "references",
        statementContext,
        statement,
      );
    }
  }
}

/**
 * Process all claims for a property
 * @param {string} propertyId - The property ID
 * @param {Array} claims - Array of claims for this property
 * @param {Object} context - Context with itemId, itemLabel, userLanguage
 */
function processPropertyClaims(propertyId, claims, context) {
  // Check the index before touching the DOM, so properties without any
  // template cost nothing (matters when several builds run on one page).
  if (_editMode || hasTemplates("property", "statement", propertyId)) {
    const $propertyElement = getPropertyElement(propertyId);
    if ($propertyElement) {
      addButtons(
        $propertyElement,
        "property",
        "statement",
        propertyId,
        { ...context, propertyId },
        null,
        { scope: "property", section: "statement", propertyId },
      );
    }
  }

  const wanted = {
    main: _editMode || hasTemplates("value", "statement", propertyId),
    qualifiers: _editMode || hasSectionTemplates("qualifiers"),
    references: _editMode || hasSectionTemplates("references"),
  };
  if (wanted.main || wanted.qualifiers || wanted.references) {
    claims.forEach((claim) => processClaim(propertyId, claim, context, wanted));
  }
}

// ===== USER CONFIG (wiki I/O) =====
// Loads and saves User:<name>/<configName>.json with the user's own session.
// The pure parsing/merging lives in src/shared/user-config.mjs.

const BUILTIN_IDS = [...USEFUL_QUERIES, ...USEFUL_LINKS].map((t) => t.id);

/**
 * Title of a user's config page.
 * @param {string} [userName] - Defaults to the logged-in user
 */
function configPageTitle(userName) {
  return "User:" + (userName || mw.config.get("wgUserName")) + "/" + SETTINGS.configName + ".json";
}

/** Title of the settings page (Special:BlankPage/<configName>). */
function settingsPageTitle() {
  return "Special:BlankPage/" + SETTINGS.configName;
}

/**
 * URL of an item page (in the configured item namespace), optionally with
 * query parameters and a "#P123" anchor in `qid`.
 * @param {string} qid - e.g. "Q42" or "Q42#P19"
 * @param {Object} [params]
 */
function itemPageUrl(qid, params) {
  const ns = SETTINGS.allowedNamespace;
  const prefix = ns ? mw.config.get("wgFormattedNamespaces")[ns] + ":" : "";
  return mw.util.getUrl(prefix + qid, params);
}

/** Whether the visitor can have a config at all. */
function canConfigure() {
  return !!mw.config.get("wgUserName");
}

/**
 * Fetch a config page.
 * @param {string} [userName]
 * @returns {Promise<{config: object, errors: string[], exists: boolean, text: string|null}>}
 */
function loadConfig(userName) {
  return mw.loader.using("mediawiki.api").then(function () {
    return new mw.Api()
      .get({
        action: "query",
        prop: "revisions",
        titles: configPageTitle(userName),
        rvprop: "content",
        rvslots: "main",
        formatversion: 2,
      })
      .then(function (data) {
        const page = data.query && data.query.pages && data.query.pages[0];
        const text =
          page && !page.missing && page.revisions
            ? page.revisions[0].slots.main.content
            : null;
        return { ...parseUserConfig(text, BUILTIN_IDS), text };
      });
  });
}

/**
 * Save the logged-in user's config. `transform` gets the config as it is on
 * the wiki right now (empty if the page does not exist yet) and the page text
 * (null if missing), and returns the config to save. It may throw an error
 * code (a string) to abort. One read, then either an edit or, for a missing
 * page, a create; a concurrent change makes MediaWiki reject the edit instead
 * of silently overwriting it.
 * @param {function(object, ?string): object} transform
 * @param {string} summary - Edit summary
 * @returns {Promise<object>} The saved config
 */
function saveConfig(transform, summary) {
  const title = configPageTitle();
  const params = { summary: summary + " (usefulQueries)" };
  let saved = null;

  function apply(text) {
    const current = parseUserConfig(text, BUILTIN_IDS);
    if (text !== null && current.errors.some((e) => e.startsWith("not valid JSON"))) {
      throw "usefulqueries-invalid-json";
    }
    saved = transform(current.config, text);
    return serializeConfig(saved);
  }

  return mw.loader.using("mediawiki.api").then(function () {
    const api = new mw.Api();
    return api
      .edit(title, (revision) => ({ ...params, text: apply(revision.content) }))
      .catch(function (code) {
        if (code !== "nocreate-missing") return $.Deferred().reject(code).promise();
        return api.create(title, params, apply(null));
      })
      .then(() => saved);
  });
}

/**
 * Change the config in place, starting from what is saved right now, so edits
 * from two tabs never overwrite each other.
 * @param {function(object): void} mutate
 * @param {string} summary
 */
function updateConfig(mutate, summary) {
  return saveConfig(function (config) {
    mutate(config);
    return config;
  }, summary);
}

/**
 * Overwrite the config with `config`, but only if the page still holds
 * `expectedText` (what the settings page loaded; null if it did not exist).
 * Rejects with "usefulqueries-conflict" otherwise.
 */
function replaceConfig(config, expectedText, summary) {
  return saveConfig(function (current, text) {
    if (text !== expectedText) throw "usefulqueries-conflict";
    return config;
  }, summary);
}

/** Human-readable message for a failed save. */
function describeSaveError(code) {
  // articleexists / editconflict: someone saved between our read and write.
  if (code === "usefulqueries-conflict" || code === "articleexists" || code === "editconflict") {
    return "Your usefulQueries config was changed elsewhere (another tab?). Reload this page and try again.";
  }
  if (code === "usefulqueries-invalid-json") {
    return "Your config page is not valid JSON, so it was not changed. Fix or blank it first: " + configPageTitle();
  }
  return "Saving failed: " + code;
}

// ===== EDITOR (item page) =====
// Edit mode and the "add / edit a button" dialog. Everything here runs only
// after the user opts in from the Tools menu, so it costs nothing otherwise.

// Codex components the editor needs; older wikis without them get a notice.
const EDITOR_COMPONENTS = [
  "CdxButton",
  "CdxDialog",
  "CdxField",
  "CdxMessage",
  "CdxRadio",
  "CdxTextArea",
  "CdxTextInput",
];

const EMOJI_SUGGESTIONS = ["🔍", "🗺️", "📅", "📊", "🖼️", "👥", "🏛️", "📚", "🔗", "🌳"];

const PREVIEW_ROWS = 5;

// The Vue instance of the dialog, created on first use.
let _editorVm = null;

/** SPARQL endpoint of the configured query service. */
function sparqlEndpoint() {
  return SETTINGS.sparqlEndpoint || new URL("sparql", SETTINGS.queryServiceUrl).href;
}

/** Label of a property as shown on the current page, or its ID. */
function propertyLabelOnPage(propertyId) {
  const $el = getPropertyElement(propertyId);
  let text = $el ? $el.find("a").first().text().trim() : "";
  // Qualifier and reference properties have no statement group of their own.
  if (!text) text = $('a[title="Property:' + propertyId + '"]').first().text().trim();
  return text || propertyId;
}

/** Value details of a snak, with the label read from the page if needed. */
function snakValueWithLabel(snak, $container) {
  const value = extractValueFromMainsnak(snak);
  if (value.value && value.label === null && $container) {
    const $snak = getSnakElement($container, snak.hash);
    value.label = $snak ? getSnakValueLabel($snak) : null;
  }
  return value;
}

/**
 * Find a spot on the current page where a template would show, so editing it
 * from the settings page can preview it with real values.
 * @param {Object} tpl - Template in JSON form
 * @returns {Object} A target as passed to openTemplateEditor
 */
function findTargetForTemplate(tpl) {
  if (tpl.scope === "entity") return { scope: "entity" };
  const claims = (_page.entityData && _page.entityData.claims) || {};
  const section = sectionOf(tpl);
  if (section !== "statement") return findSnakTarget(tpl, section, claims);
  for (const pid of tpl.propertyId) {
    if (!claims[pid]) continue;
    if (tpl.scope === "property") return { scope: "property", propertyId: pid };
    for (const claim of claims[pid]) {
      const value = extractValueFromMainsnak(claim.mainsnak);
      if (!value.value) continue;
      if (tpl.valueId && !tpl.valueId.includes(value.value)) continue;
      if (value.label === null) {
        const $st = getStatementElement(claim.id);
        value.label = $st ? getStatementValueLabel($st) : null;
      }
      return { scope: "value", propertyId: pid, value };
    }
  }
  // Not applicable on this item: edit without value placeholders filled in.
  return { scope: tpl.scope, section, propertyId: tpl.propertyId[0], value: null };
}

/** findTargetForTemplate() for qualifier and reference templates. */
function findSnakTarget(tpl, section, claims) {
  for (const [statementPid, list] of Object.entries(claims)) {
    for (const claim of list) {
      const $statement = getStatementElement(claim.id);
      const mainValue = extractValueFromMainsnak(claim.mainsnak);
      if (mainValue.value && mainValue.label === null && $statement) {
        mainValue.label = getStatementValueLabel($statement);
      }
      const statement = { propertyId: statementPid, value: mainValue };
      const groups =
        section === "qualifiers"
          ? [{ snaks: claim.qualifiers || {}, $el: $statement && getQualifiersElement($statement) }]
          : (claim.references || []).map((r) => ({
              snaks: r.snaks,
              $el: $statement && getReferenceElement($statement, r.hash),
            }));
      for (const group of groups) {
        for (const pid of tpl.propertyId) {
          for (const snak of group.snaks[pid] || []) {
            if (tpl.scope === "property") return { scope: "property", section, propertyId: pid, statement };
            const value = snakValueWithLabel(snak, group.$el);
            if (!value.value) continue;
            if (tpl.valueId && !tpl.valueId.includes(value.value)) continue;
            return { scope: "value", section, propertyId: pid, value, statement };
          }
        }
      }
    }
  }
  return { scope: tpl.scope, section, propertyId: tpl.propertyId[0], value: null, statement: null };
}

/** Switch edit mode on or off and redraw the buttons. */
function toggleEditMode() {
  _editMode = !_editMode;
  renderButtons();
  mw.notify(
    _editMode
      ? SETTINGS.displayName + " edit mode: “+” adds a button at that spot, ✕ hides a built-in, ✎ edits one of yours."
      : SETTINGS.displayName + " edit mode off.",
    { tag: "usefulqueries-editmode" },
  );
}

/**
 * Hide a built-in button for the logged-in user.
 * @param {{kind: string, id: string}} ref
 * @param {string} title - For the edit summary
 */
function hideBuiltinButton(ref, title) {
  saveAndApply(
    function (config) {
      if (!config.disabled.includes(ref.id)) config.disabled.push(ref.id);
    },
    "Hide button: " + title,
    "Hidden. Bring it back on the " + SETTINGS.displayName + " settings page.",
  ).catch(function (code) {
    mw.notify(describeSaveError(code), { type: "error", tag: "usefulqueries" });
  });
}

/**
 * Save a config change, redraw the buttons with it and confirm.
 * @param {function(object): void} mutate - See updateConfig()
 * @param {string} summary - Edit summary
 * @param {string} message - Shown when saved
 */
function saveAndApply(mutate, summary, message) {
  return updateConfig(mutate, summary).then(function (config) {
    applyUserConfig(config);
    mw.notify(message, { tag: "usefulqueries" });
  });
}


/**
 * Open the editor dialog, either for a new button at `target` or for an
 * existing user template `ref`.
 * @param {Object|null} target - {scope, propertyId?, value?}
 * @param {{kind: string, id: string}|null} ref
 */
function openTemplateEditor(target, ref) {
  let existing = null;
  if (ref) {
    const list = ref.kind === "query" ? _userConfig.queries : _userConfig.links;
    const tpl = list.find((t) => t.id === ref.id);
    if (!tpl) {
      mw.notify("That button is no longer in your config.", { type: "error" });
      return;
    }
    existing = { kind: ref.kind, template: tpl };
    target = target || findTargetForTemplate(tpl);
  }

  loadCodex(EDITOR_COMPONENTS, ["mediawiki.api"]).then(function ({ Vue, Codex, missing }) {
    if (missing) {
      mw.notify(missing, { type: "error" });
      return;
    }
    if (!_editorVm) _editorVm = mountEditor(Vue, Codex);
    _editorVm.start(target, existing);
  });
}

/**
 * One row of placeholder chips. Hovering a chip explains the placeholder and
 * shows its value on the current item; clicking emits `pick` with its name.
 * mousedown is prevented so the input being typed in keeps focus (and its
 * cursor position) for the insertion.
 */
const UqPlaceholderChips = {
  name: "UqPlaceholderChips",
  props: {
    names: { type: Array, required: true },
    context: { type: Object, required: true },
  },
  emits: ["pick"],
  methods: {
    tooltip: function (name) {
      const value = this.context[name];
      const example =
        value === undefined ? "" : "\nOn this item: " + (value === "" ? "(empty)" : value);
      return (PLACEHOLDER_HELP[name] || "") + example + "\nClick to insert.";
    },
  },
  template: `
    <div class="uq-chips">
      <button v-for="name in names" :key="name" type="button" class="uq-chip" :title="tooltip(name)"
        @mousedown.prevent @click="$emit('pick', name)">{{ '{' + name + '}' }}</button>
    </div>
  `,
};

/**
 * Create the dialog's Vue app.
 * @returns {Object} The root component instance
 */
function mountEditor(Vue, Codex) {
  mw.util.addCSS(
    ".usefulqueries-editor { max-width: 60em; width: 100%; }" +
      ".usefulqueries-editor .uq-mono textarea, .usefulqueries-editor .uq-mono input { font-family: monospace; font-size: 0.9em; }" +
      ".usefulqueries-editor .uq-chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0; }" +
      ".usefulqueries-editor .uq-chip { font-family: monospace; font-size: 0.85em; padding: 1px 6px; border: 1px solid #a2a9b1; border-radius: 2px; background: none; cursor: pointer; color: inherit; }" +
      ".usefulqueries-editor .uq-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 6px; }" +
      ".usefulqueries-editor .uq-preview { overflow-x: auto; max-height: 16em; margin-top: 6px; }" +
      ".usefulqueries-editor .uq-preview table { font-size: 0.85em; }" +
      ".usefulqueries-editor .uq-muted { opacity: 0.75; font-size: 0.9em; }" +
      ".usefulqueries-editor section { margin-bottom: 1.2em; }",
  );

  const mountPoint = document.createElement("div");
  document.body.appendChild(mountPoint);

  const app = Vue.createMwApp({
    name: "UsefulQueriesEditor",
    data: function () {
      return {
        open: false,
        target: { scope: "entity" },
        existingId: null,
        existingExample: null,
        kind: "query",
        placement: "entity",
        propertyIdsText: "",
        valueIdsText: "",
        sparql: "",
        urlTemplate: "",
        emoji: "🔍",
        title: "",
        pasteUrl: "",
        pasteMessage: null,
        triedSave: false,
        saving: false,
        saveError: null,
        confirmDelete: false,
        preview: { status: "idle" },
        emojiSuggestions: EMOJI_SUGGESTIONS,
      };
    },
    computed: {
      section: function () {
        return this.target.section || "statement";
      },
      context: function () {
        const t = this.target;
        let base = _page.context;
        if (this.section !== "statement" && t.statement) {
          base = statementPlaceholders(base, t.statement.propertyId, t.statement.value);
        }
        if (t.scope === "value" && t.value && this.scope === "value") {
          return valuePlaceholders(base, t.propertyId, t.value);
        }
        const ctx = { ...base };
        if (t.scope !== "entity") ctx.propertyId = t.propertyId;
        return ctx;
      },
      statementText: function () {
        const st = this.target.statement;
        if (!st) return "";
        const v = st.value;
        return propertyLabelOnPage(st.propertyId) + " → " + (v ? v.label || v.value || "…" : "…");
      },
      propertyLabel: function () {
        return this.target.propertyId ? propertyLabelOnPage(this.target.propertyId) : "";
      },
      valueLabel: function () {
        const v = this.target.value;
        return v ? v.label || v.value : "";
      },
      valueIsItem: function () {
        const v = this.target.value;
        return !!(v && v.entityId && /^Q\d+$/.test(v.entityId));
      },
      where: function () {
        const t = this.target;
        if (t.scope === "entity") return "next to the item title";
        const spot =
          t.scope === "property"
            ? "“" + this.propertyLabel + "”"
            : "“" + this.propertyLabel + " → " + (this.valueLabel || "…") + "”";
        if (this.section === "qualifiers") {
          return "next to the qualifier " + spot + (this.statementText ? " of “" + this.statementText + "”" : "");
        }
        if (this.section === "references") {
          return "next to " + spot + " in a reference" + (this.statementText ? " of “" + this.statementText + "”" : "");
        }
        return "next to " + spot;
      },
      sectionNoun: function () {
        return { statement: "", qualifiers: "qualifier ", references: "reference " }[this.section];
      },
      scope: function () {
        if (this.placement === "entity") return "entity";
        if (this.placement === "property") return "property";
        return "value";
      },
      propertyIds: function () {
        return this.propertyIdsText.split(/[\s,]+/).filter(Boolean).map((p) => p.toUpperCase());
      },
      valueIds: function () {
        return this.valueIdsText.split(/[\s,]+/).filter(Boolean).map((q) => q.toUpperCase());
      },
      placeholders: function () {
        const list = [...BASE_PLACEHOLDERS];
        if (this.scope !== "entity") list.push(...PROPERTY_PLACEHOLDERS);
        if (this.scope === "value") list.push(...VALUE_PLACEHOLDERS);
        if (this.scope !== "entity" && this.section !== "statement") list.push(...STATEMENT_PLACEHOLDERS);
        return list;
      },
      sparqlLines: function () {
        return this.sparql.replace(/\s+$/, "").split("\n");
      },
      draft: function () {
        const tpl = {
          id: this.existingId || makeTemplateId(this.title, this.takenIds()),
          example: this.existingExample || _page.context.itemId,
          scope: this.scope,
        };
        if (this.scope !== "entity" && this.section !== "statement") tpl.section = this.section;
        if (this.scope !== "entity") tpl.propertyId = this.propertyIds;
        if (this.placement === "only") tpl.valueId = this.valueIds;
        if (this.kind === "query") {
          tpl.template = this.sparqlLines;
        } else {
          tpl.urlTemplate = this.urlTemplate.trim();
        }
        tpl.emoji = this.emoji.trim();
        tpl.title = this.title.trim();
        return tpl;
      },
      errors: function () {
        return validateTemplate(this.draft, this.kind, { sparqlChecks: false });
      },
      warnings: function () {
        if (this.kind !== "query" || !this.sparql.trim()) return [];
        return checkSparql(this.sparqlLines);
      },
      filledQuery: function () {
        return replacePlaceholders(this.sparql, this.context);
      },
      filledUrl: function () {
        return replacePlaceholders(this.urlTemplate.trim(), this.context);
      },
      titlePreview: function () {
        return replacePlaceholders(this.title, this.context);
      },
      primaryAction: function () {
        return {
          label: this.saving ? "Saving…" : this.existingId ? "Save changes" : "Add button",
          actionType: "progressive",
          disabled: this.saving,
        };
      },
      suggestUrl: function () {
        return this.existingId
          ? suggestionIssueUrl(this.draft, this.kind, SETTINGS.repositoryUrl)
          : null;
      },
    },
    watch: {
      sparql: function () {
        this.preview = { status: "idle" };
      },
      placement: function () {
        this.preview = { status: "idle" };
      },
    },
    methods: {
      takenIds: function () {
        return [...BUILTIN_IDS, ..._userConfig.queries.map((t) => t.id), ..._userConfig.links.map((t) => t.id)];
      },
      start: function (target, existing) {
        this.target = target;
        this.triedSave = false;
        this.saving = false;
        this.saveError = null;
        this.confirmDelete = false;
        this.pasteUrl = "";
        this.pasteMessage = null;
        this.preview = { status: "idle" };
        if (existing) {
          const tpl = existing.template;
          this.existingId = tpl.id;
          this.existingExample = tpl.example;
          this.kind = existing.kind;
          this.placement =
            tpl.scope === "value" ? (tpl.valueId ? "only" : "every") : tpl.scope;
          this.propertyIdsText = (tpl.propertyId || []).join(", ");
          this.valueIdsText = (tpl.valueId || []).join(", ");
          this.sparql = existing.kind === "query" ? tpl.template.join("\n") : "";
          this.urlTemplate = tpl.urlTemplate || "";
          this.emoji = tpl.emoji;
          this.title = tpl.title;
        } else {
          this.existingId = null;
          this.existingExample = null;
          this.kind = "query";
          this.placement = target.scope === "value" ? "every" : target.scope;
          this.propertyIdsText = target.propertyId || "";
          this.valueIdsText = this.valueIsItem ? target.value.value : "";
          this.sparql = "";
          this.urlTemplate = "";
          this.emoji = "🔍";
          this.title = "";
        }
        this.open = true;
      },
      insert: function (refName, field, name) {
        const token = "{" + name + "}";
        const ref = this.$refs[refName];
        const el = ref && ref.$el ? ref.$el.querySelector("textarea, input") : null;
        if (el && typeof el.selectionStart === "number" && document.activeElement === el) {
          const start = el.selectionStart;
          const end = el.selectionEnd;
          this[field] = this[field].slice(0, start) + token + this[field].slice(end);
          this.$nextTick(function () {
            el.focus();
            el.setSelectionRange(start + token.length, start + token.length);
          });
        } else {
          this[field] = this[field] + token;
        }
      },
      openInQueryService: function () {
        const text = this.filledQuery.trim() || "SELECT ?item WHERE {\n  \n}";
        window.open(SETTINGS.queryServiceUrl + encodeQueryString(text), "_blank", "noopener,noreferrer");
      },
      importFromUrl: function () {
        const text = queryFromServiceUrl(this.pasteUrl);
        if (!text) {
          this.pasteMessage = {
            type: "error",
            text: "No query found in that link. Short links (w.wiki/…) can't be read — copy the full address from the browser's address bar instead.",
          };
          return;
        }
        const value = this.scope === "value" && this.target.value ? this.context : {};
        const result = generalizeQuery(text, {
          itemId: _page.context.itemId,
          valueId: value.valueId || null,
          valueSparql: value.valueSparql || null,
          statementValueId: this.context.statementValueId || null,
        });
        this.sparql = result.text;
        this.pasteUrl = "";
        this.pasteMessage = {
          type: "success",
          text: result.replacements.length
            ? "Query imported. Replaced " +
              result.replacements
                .map((r) => r.from + " → " + r.to + (r.count > 1 ? " (" + r.count + "×)" : ""))
                .join(", ") +
              ", so it works on other items too."
            : "Query imported. It contains no ID of this item or value — check it is meant to be the same everywhere.",
        };
      },
      runPreview: function () {
        const vm = this;
        const query = this.filledQuery;
        if (!query.trim()) return;
        const started = Date.now();
        vm.preview = { status: "running" };
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 65000);
        fetch(sparqlEndpoint() + "?format=json&query=" + encodeURIComponent(query), {
          headers: { Accept: "application/sparql-results+json" },
          signal: controller.signal,
        })
          .then(function (response) {
            if (!response.ok) {
              return response.text().then(function (body) {
                // WDQS puts the parser message in the first lines of the body.
                const line = body.split("\n").find((l) => /Exception|error/i.test(l)) || body.slice(0, 300);
                throw new Error("HTTP " + response.status + ": " + line.trim().slice(0, 400));
              });
            }
            return response.json();
          })
          .then(function (json) {
            const vars = (json.head && json.head.vars) || [];
            const bindings = (json.results && json.results.bindings) || [];
            vm.preview = {
              status: "done",
              vars,
              count: bindings.length,
              ms: Date.now() - started,
              rows: bindings.slice(0, PREVIEW_ROWS).map((b) =>
                vars.map((v) => (b[v] ? shortenTerm(b[v].value) : "")),
              ),
              isAsk: typeof json.boolean === "boolean",
            };
          })
          .catch(function (err) {
            vm.preview = {
              status: "error",
              error: err.name === "AbortError" ? "The query took longer than 60 seconds." : err.message,
            };
          })
          .finally(() => clearTimeout(timer));
      },
      save: function () {
        this.triedSave = true;
        if (this.errors.length) return;
        const tpl = this.draft;
        const kind = this.kind;
        const replacing = this.existingId;
        this.persist(
          function (config) {
            removeTemplate(config, replacing);
            (kind === "query" ? config.queries : config.links).push(tpl);
          },
          (replacing ? "Edit button: " : "Add button: ") + tpl.title,
          replacing ? "Button saved." : "Button added.",
        );
      },
      remove: function () {
        const id = this.existingId;
        this.persist((config) => removeTemplate(config, id), "Delete button: " + this.title, "Button deleted.");
      },
      persist: function (mutate, summary, message) {
        const vm = this;
        vm.saving = true;
        vm.saveError = null;
        saveAndApply(mutate, summary, message)
          .then(function () {
            vm.open = false;
          })
          .catch(function (code) {
            vm.saveError = describeSaveError(code);
          })
          .always(function () {
            vm.saving = false;
          });
      },
    },
    template: `
      <cdx-dialog
        v-model:open="open"
        class="usefulqueries-editor"
        :title="existingId ? 'Edit button' : 'Add a button'"
        :subtitle="'Shown ' + where"
        :use-close-button="true"
        :primary-action="primaryAction"
        :default-action="{ label: 'Cancel' }"
        @primary="save"
        @default="open = false"
      >
        <section v-if="target.scope === 'value'">
          <cdx-field :is-fieldset="true">
            <template #label>Where should the button appear?</template>
            <cdx-radio v-model="placement" name="uq-placement" input-value="every">
              Next to every {{ sectionNoun }}“{{ propertyLabel }}” value — the result is about that value
            </cdx-radio>
            <cdx-radio v-if="valueIsItem || placement === 'only'" v-model="placement" name="uq-placement" input-value="only">
              Only when {{ sectionNoun }}“{{ propertyLabel }}” is {{ valueLabel }} — the value only decides whether the button shows
            </cdx-radio>
            <cdx-radio v-model="placement" name="uq-placement" input-value="property">
              Once, next to the {{ sectionNoun }}“{{ propertyLabel }}” label — the query uses all of its values, or none
            </cdx-radio>
          </cdx-field>
          <cdx-field v-if="placement === 'only'">
            <template #label>Values that show the button</template>
            <template #help-text>Item IDs, separated by commas.</template>
            <cdx-text-input v-model="valueIdsText" class="uq-mono"></cdx-text-input>
          </cdx-field>
        </section>

        <section v-if="scope !== 'entity'">
          <cdx-field>
            <template #label>Properties</template>
            <template #help-text>
              The button appears for any of these. Add more (e.g. P19, P20) and use
              <code>{propertyId}</code> in the query to refer to the one that matched.
            </template>
            <cdx-text-input v-model="propertyIdsText" class="uq-mono"></cdx-text-input>
          </cdx-field>
        </section>

        <section>
          <cdx-field :is-fieldset="true">
            <template #label>What does the button do?</template>
            <cdx-radio v-model="kind" name="uq-kind" input-value="query">Run a SPARQL query in a popup</cdx-radio>
            <cdx-radio v-model="kind" name="uq-kind" input-value="link">Open a link to another website</cdx-radio>
          </cdx-field>
        </section>

        <section v-if="kind === 'query'">
          <cdx-field>
            <template #label>SPARQL query</template>
            <template #help-text>
              Easiest: write it in the Query Service for this item, then paste the link below — the IDs of
              this item and value are swapped for placeholders automatically.
            </template>
            <uq-placeholder-chips :names="placeholders" :context="context"
              @pick="insert('sparqlInput', 'sparql', $event)"></uq-placeholder-chips>
            <p v-if="section !== 'statement' && scope !== 'entity'" class="uq-muted" style="margin: 4px 0;">
              The <code>{statement…}</code> placeholders refer to the statement this {{ sectionNoun.trim() }} belongs to
              ({{ statementText || 'its property and value' }}).
            </p>
            <cdx-text-area ref="sparqlInput" v-model="sparql" class="uq-mono" rows="12"
              placeholder="SELECT ?item ?itemLabel WHERE { … }"></cdx-text-area>
          </cdx-field>
          <div class="uq-row">
            <cdx-button @click="openInQueryService">Open in Query Service ↗</cdx-button>
            <cdx-text-input v-model="pasteUrl" style="flex: 1; min-width: 12em;"
              placeholder="…then paste the Query Service link here" @keydown.enter.prevent="importFromUrl"></cdx-text-input>
            <cdx-button :disabled="!pasteUrl.trim()" @click="importFromUrl">Use this query</cdx-button>
          </div>
          <cdx-message v-if="pasteMessage" :type="pasteMessage.type" :inline="true" style="margin-top: 6px;">
            {{ pasteMessage.text }}
          </cdx-message>
          <cdx-message v-for="w in warnings" :key="w" type="warning" :inline="true" style="margin-top: 6px;">
            {{ w }}
          </cdx-message>

          <div class="uq-row">
            <cdx-button :disabled="!sparql.trim() || preview.status === 'running'" @click="runPreview">
              {{ preview.status === 'running' ? 'Running…' : 'Test on this item' }}
            </cdx-button>
            <span v-if="preview.status === 'done' && !preview.isAsk">
              {{ preview.count }} row{{ preview.count === 1 ? '' : 's' }} in {{ (preview.ms / 1000).toFixed(1) }} s
            </span>
          </div>
          <cdx-message v-if="preview.status === 'error'" type="error" :inline="true" style="margin-top: 6px;">
            {{ preview.error }}
          </cdx-message>
          <cdx-message v-if="preview.status === 'done' && preview.count === 0 && !preview.isAsk" type="warning" :inline="true" style="margin-top: 6px;">
            No results on this item. A button should return rows on the item it is made on.
          </cdx-message>
          <div v-if="preview.status === 'done' && preview.count" class="uq-preview">
            <table class="wikitable">
              <thead><tr><th v-for="v in preview.vars" :key="v">{{ v }}</th></tr></thead>
              <tbody><tr v-for="(row, i) in preview.rows" :key="i"><td v-for="(cell, j) in row" :key="j">{{ cell }}</td></tr></tbody>
            </table>
          </div>
        </section>

        <section v-else>
          <cdx-field>
            <template #label>Link address</template>
            <template #help-text>Must start with https://. Placeholders are filled in for each item.</template>
            <uq-placeholder-chips :names="placeholders" :context="context"
              @pick="insert('urlInput', 'urlTemplate', $event)"></uq-placeholder-chips>
            <cdx-text-input ref="urlInput" v-model="urlTemplate" class="uq-mono"
              placeholder="https://example.org/{itemId}"></cdx-text-input>
          </cdx-field>
          <p v-if="filledUrl" class="uq-muted">
            On this item: <a :href="filledUrl" target="_blank" rel="noopener noreferrer">{{ filledUrl }}</a>
          </p>
        </section>

        <section>
          <cdx-field>
            <template #label>Button</template>
            <template #help-text>A short label, usually one emoji.</template>
            <div class="uq-row" style="margin-top: 0;">
              <cdx-text-input v-model="emoji" style="width: 6em;"></cdx-text-input>
              <button v-for="e in emojiSuggestions" :key="e" type="button" class="uq-chip" @click="emoji = e">{{ e }}</button>
            </div>
          </cdx-field>
          <cdx-field>
            <template #label>Title</template>
            <template #help-text>Tooltip and popup heading.</template>
            <uq-placeholder-chips :names="placeholders" :context="context"
              @pick="insert('titleInput', 'title', $event)"></uq-placeholder-chips>
            <cdx-text-input ref="titleInput" v-model="title" placeholder="People born in {valueLabel}"></cdx-text-input>
          </cdx-field>
          <p v-if="title.trim()" class="uq-muted">On this item: <strong>{{ emoji }}</strong> {{ titlePreview }}</p>
        </section>

        <cdx-message v-if="triedSave && errors.length" type="error">
          <ul style="margin: 0;"><li v-for="e in errors" :key="e">{{ e }}</li></ul>
        </cdx-message>
        <cdx-message v-if="saveError" type="error">{{ saveError }}</cdx-message>

        <section v-if="existingId" class="uq-row">
          <a v-if="suggestUrl" :href="suggestUrl" target="_blank" rel="noopener noreferrer">Suggest this button for everyone ↗</a>
          <span style="flex: 1;"></span>
          <template v-if="!confirmDelete">
            <cdx-button action="destructive" weight="quiet" @click="confirmDelete = true">Delete button</cdx-button>
          </template>
          <template v-else>
            <span>Delete “{{ title }}”?</span>
            <cdx-button action="destructive" weight="primary" :disabled="saving" @click="remove">Delete</cdx-button>
            <cdx-button @click="confirmDelete = false">Keep</cdx-button>
          </template>
        </section>
      </cdx-dialog>
    `,
  });

  for (const name of EDITOR_COMPONENTS) app.component(name, Codex[name]);
  app.component("UqPlaceholderChips", UqPlaceholderChips);
  return app.mount(mountPoint);
}

/** Shorten an entity URI to its ID for the preview table. */
function shortenTerm(value) {
  const m = /\/entity\/([A-Z]\d+)$/.exec(value);
  return m ? m[1] : value;
}

// ===== SETTINGS PAGE =====
// Special:BlankPage/<configName>: switch built-ins on and off, manage your own
// buttons, import buttons from other users. Saves to configPageTitle().

const SETTINGS_COMPONENTS = ["CdxButton", "CdxMessage", "CdxTextInput", "CdxToggleSwitch", "CdxCheckbox"];

const SCOPE_HEADINGS = {
  entity: "Next to the item title",
  property: "Next to a property",
  value: "Next to a statement value",
};

/**
 * Fetch labels for entity IDs in the user's language.
 * @param {string[]} ids
 * @returns {Promise<Object<string, string>>} id → label
 */
function fetchLabels(ids) {
  const unique = [...new Set(ids)];
  const api = new mw.Api();
  const chunks = [];
  for (let i = 0; i < unique.length; i += 50) chunks.push(unique.slice(i, i + 50));
  return Promise.all(
    chunks.map((chunk) =>
      api
        .get({
          action: "wbgetentities",
          ids: chunk.join("|"),
          props: "labels",
          languages: mw.config.get("wgUserLanguage"),
          languagefallback: 1,
          formatversion: 2,
        })
        .then((data) => data.entities || {}, () => ({})),
    ),
  ).then(function (results) {
    const labels = {};
    for (const entities of results) {
      for (const [id, entity] of Object.entries(entities)) {
        const label = entity.labels && Object.values(entity.labels)[0];
        if (label) labels[id] = label.value;
      }
    }
    return labels;
  });
}

/**
 * A template's example item with the anchor of the statement group that
 * triggers it (Q454172#P937), so the link scrolls to where the button is.
 * Qualifier/reference and entity buttons link to the item itself. If the
 * example lacks that property, the browser simply stays at the top.
 */
function withAnchor(t) {
  return t.scope !== "entity" && sectionOf(t) === "statement" && t.propertyId
    ? t.example + "#" + t.propertyId[0]
    : t.example;
}

/** Show placeholders in a title as readable markers. */
function humanizeTitle(title) {
  return title
    .replace(/\{itemLabel\}/g, "‹item›")
    .replace(/\{valueLabel\}/g, "‹value›")
    .replace(/\{(\w+)\}/g, "‹$1›");
}

/** Tools-menu link to the settings page. */
function addSettingsPortletLink() {
  mw.loader.using("mediawiki.util").then(function () {
    mw.util.addPortletLink(
      "p-tb",
      mw.util.getUrl(settingsPageTitle()),
      SETTINGS.displayName + " settings",
      "t-usefulqueries-settings-" + SETTINGS.configName,
      "Choose which usefulQueries buttons you see and make your own",
    );
  });
}

/** Render the settings page into the content area. */
function renderSettingsPage() {
  const heading = SETTINGS.displayName + " settings";
  document.title = heading + " – " + mw.config.get("wgSiteName");
  $("#firstHeading, .mw-first-heading").first().text(heading);
  const $content = $("#mw-content-text").empty();

  if (!canConfigure()) {
    $content.append(
      $("<p>").text("Log in to choose which usefulQueries buttons you see and to make your own."),
    );
    return;
  }

  const mountPoint = document.createElement("div");
  $content.append(mountPoint);
  $(mountPoint).text("Loading…");

  loadCodex(SETTINGS_COMPONENTS, ["mediawiki.api", "mediawiki.util"])
    .then(function (codex) {
      if (codex.missing) return { codex };
      return loadConfig().then(function (loaded) {
        const ids = [];
        for (const t of [...USEFUL_QUERIES, ...USEFUL_LINKS, ...loaded.config.queries, ...loaded.config.links]) {
          ids.push(...(t.propertyId || []), ...(t.valueId || []));
        }
        return fetchLabels(ids).then((labels) => ({ codex, loaded, labels }));
      });
    })
    .then(function ({ codex, loaded, labels }) {
      if (codex.missing) {
        $(mountPoint).text(codex.missing);
        return;
      }
      $(mountPoint).empty();
      mountSettingsApp(codex.Vue, codex.Codex, mountPoint, loaded, labels);
    })
    .catch(function (err) {
      $(mountPoint).text("Could not load your usefulQueries config: " + err);
    });
}

function mountSettingsApp(Vue, Codex, mountPoint, loaded, labels) {
  mw.util.addCSS(
    ".uq-settings .uq-list { list-style: none; margin: 0 0 1.5em; padding: 0; }" +
      ".uq-settings .uq-item { display: flex; gap: 12px; align-items: flex-start; padding: 8px 0; border-bottom: 1px solid #eaecf0; }" +
      ".uq-settings .uq-emoji { font-size: 1.3em; width: 1.6em; text-align: center; flex: none; }" +
      ".uq-settings .uq-body { flex: 1; min-width: 0; }" +
      ".uq-settings .uq-meta { font-size: 0.875em; opacity: 0.8; }" +
      ".uq-settings .uq-badge { display: inline-block; font-size: 0.75em; padding: 0 6px; border-radius: 8px; border: 1px solid currentColor; margin-left: 6px; vertical-align: middle; }" +
      ".uq-settings .uq-actions { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; flex: none; }" +
      ".uq-settings .uq-bar { position: sticky; bottom: 0; background: var(--background-color-base, #fff); padding: 10px 0; border-top: 1px solid #a2a9b1; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; z-index: 2; }" +
      ".uq-settings .uq-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }",
  );

  const builtins = [
    ...USEFUL_QUERIES.map((t) => ({ kind: "query", t })),
    ...USEFUL_LINKS.map((t) => ({ kind: "link", t })),
  ];

  const app = Vue.createMwApp({
    name: "UsefulQueriesSettings",
    data: function () {
      return {
        config: JSON.parse(JSON.stringify(loaded.config)),
        savedText: serializeConfig(loaded.config),
        loadedText: loaded.text,
        exists: loaded.exists,
        loadErrors: loaded.errors,
        labels,
        saving: false,
        saveError: null,
        confirmDelete: null,
        importUser: "",
        importStatus: null,
        importList: [],
        importPicked: [],
        displayName: SETTINGS.displayName,
        helpUrl: SETTINGS.helpUrl,
      };
    },
    computed: {
      groups: function () {
        return ["entity", "property", "value"]
          .map((scope) => ({
            scope,
            heading: SCOPE_HEADINGS[scope],
            items: builtins.filter((b) => b.t.scope === scope),
          }))
          .filter((g) => g.items.length);
      },
      own: function () {
        return [
          ...this.config.queries.map((t) => ({ kind: "query", t })),
          ...this.config.links.map((t) => ({ kind: "link", t })),
        ];
      },
      dirty: function () {
        return serializeConfig(this.normalized()) !== this.savedText || !this.exists;
      },
      hiddenCount: function () {
        return this.config.disabled.filter((id) => BUILTIN_IDS.includes(id)).length;
      },
      configPageUrl: function () {
        return mw.util.getUrl(configPageTitle());
      },
      configTitle: function () {
        return configPageTitle();
      },
    },
    methods: {
      normalized: function () {
        // Everything on this page has now been seen; drop ids of built-ins
        // that no longer exist so the page does not collect clutter.
        return {
          ...this.config,
          disabled: this.config.disabled.filter((id) => BUILTIN_IDS.includes(id)),
          seen: [...BUILTIN_IDS],
        };
      },
      isOn: function (id) {
        return !this.config.disabled.includes(id);
      },
      setOn: function (id, on) {
        const disabled = this.config.disabled.filter((d) => d !== id);
        if (!on) disabled.push(id);
        this.config.disabled = disabled;
      },
      setAll: function (on) {
        this.config.disabled = on ? [] : [...BUILTIN_IDS];
      },
      isNew: function (id) {
        return this.exists && !this.config.seen.includes(id);
      },
      describe: function (t) {
        const prop = (id) => (this.labels[id] ? this.labels[id] + " (" + id + ")" : id);
        if (t.scope === "entity") return "every item";
        let text = (t.propertyId || []).map(prop).join(", ");
        if (t.valueId) text += " = " + t.valueId.map(prop).join(" or ");
        if (t.section === "qualifiers") text = "qualifier " + text;
        if (t.section === "references") text += " in references";
        return text;
      },
      title: function (t) {
        return humanizeTitle(t.title);
      },
      exampleUrl: function (t) {
        return t.example ? itemPageUrl(withAnchor(t)) : null;
      },
      editUrl: function (t) {
        return itemPageUrl(withAnchor(t), { "usefulqueries-edit": t.id });
      },
      suggestUrl: function (entry) {
        return suggestionIssueUrl(entry.t, entry.kind, SETTINGS.repositoryUrl);
      },
      removeOwn: function (entry) {
        removeTemplate(this.config, entry.t.id);
        this.confirmDelete = null;
      },
      loadImport: function () {
        const vm = this;
        const user = vm.importUser.trim().replace(/^User:/i, "");
        if (!user) return;
        vm.importStatus = { type: "notice", text: "Loading…" };
        vm.importList = [];
        vm.importPicked = [];
        loadConfig(user)
          .then(function (other) {
            if (!other.exists) {
              vm.importStatus = { type: "warning", text: user + " has no usefulQueries config on this wiki." };
              return;
            }
            vm.importList = [
              ...other.config.queries.map((t) => ({ kind: "query", t })),
              ...other.config.links.map((t) => ({ kind: "link", t })),
            ];
            vm.importStatus = vm.importList.length
              ? null
              : { type: "notice", text: user + " has not made any buttons of their own." };
          })
          .catch(function (err) {
            vm.importStatus = { type: "error", text: "Could not load: " + err };
          });
      },
      addImported: function () {
        const picked = this.importList.filter((e) => this.importPicked.includes(e.kind + ":" + e.t.id));
        const next = importTemplates(this.config, picked.map((e) => ({ kind: e.kind, template: e.t })), BUILTIN_IDS);
        this.config.queries = next.queries;
        this.config.links = next.links;
        this.importStatus = {
          type: "success",
          text: "Added " + picked.length + " button" + (picked.length === 1 ? "" : "s") + ". Save to keep them.",
        };
        this.importPicked = [];
      },
      save: function () {
        const vm = this;
        const config = vm.normalized();
        vm.saving = true;
        vm.saveError = null;
        replaceConfig(config, vm.loadedText, "Update settings")
          .then(function () {
            vm.loadedText = serializeConfig(config);
            vm.savedText = vm.loadedText;
            vm.exists = true;
            vm.config.seen = config.seen;
            vm.config.disabled = config.disabled;
            mw.notify("usefulQueries settings saved.", { tag: "usefulqueries" });
          })
          .catch(function (code) {
            vm.saveError = describeSaveError(code);
          })
          .always(function () {
            vm.saving = false;
          });
      },
    },
    template: `
      <div class="uq-settings">
        <p class="uq-meta" style="float: right; margin: 0 0 8px 12px;">
          <a :href="helpUrl" target="_blank" rel="noopener">Help: how to add and edit buttons ↗</a>
        </p>
        <p>
          Choose which buttons {{ displayName }} adds to item pages, and manage buttons you made yourself.
          To make a new button, open an item and choose <em>{{ displayName }}: edit buttons</em> in the Tools menu,
          then click “+” where the button should go. The <a :href="helpUrl" target="_blank" rel="noopener">help page</a>
          explains every step and control.
        </p>
        <p class="uq-meta">
          Your choices are stored on <a :href="configPageUrl">{{ configTitle }}</a>,
          a page in your user space that only you can edit (and anyone can read).
        </p>
        <cdx-message v-if="loadErrors.length" type="warning">
          Some entries on your config page are invalid and are ignored (saving here removes them):
          <ul><li v-for="e in loadErrors" :key="e">{{ e }}</li></ul>
        </cdx-message>

        <h2>Your buttons</h2>
        <p v-if="!own.length" class="uq-meta">None yet.</p>
        <ul class="uq-list">
          <li v-for="entry in own" :key="entry.t.id" class="uq-item">
            <span class="uq-emoji">{{ entry.t.emoji }}</span>
            <div class="uq-body">
              <div>{{ title(entry.t) }} <span class="uq-badge">{{ entry.kind === 'query' ? 'Query' : 'Link' }}</span></div>
              <div class="uq-meta">Shown for {{ describe(entry.t) }} · <code>{{ entry.t.id }}</code></div>
            </div>
            <div class="uq-actions">
              <template v-if="confirmDelete !== entry.t.id">
                <a :href="editUrl(entry.t)">Edit on {{ entry.t.example }}</a>
                <a :href="suggestUrl(entry)" target="_blank" rel="noopener noreferrer">Suggest for everyone ↗</a>
                <cdx-button action="destructive" weight="quiet" @click="confirmDelete = entry.t.id">Delete</cdx-button>
              </template>
              <template v-else>
                <span>Delete?</span>
                <cdx-button action="destructive" weight="primary" @click="removeOwn(entry)">Delete</cdx-button>
                <cdx-button @click="confirmDelete = null">Keep</cdx-button>
              </template>
            </div>
          </li>
        </ul>

        <h2>Built-in buttons</h2>
        <div class="uq-row">
          <cdx-button @click="setAll(true)">Show all</cdx-button>
          <cdx-button @click="setAll(false)">Hide all</cdx-button>
          <span class="uq-meta" v-if="hiddenCount">{{ hiddenCount }} hidden</span>
        </div>
        <template v-for="g in groups" :key="g.scope">
          <h3>{{ g.heading }}</h3>
          <ul class="uq-list">
            <li v-for="b in g.items" :key="b.t.id" class="uq-item">
              <span class="uq-emoji">{{ b.t.emoji }}</span>
              <div class="uq-body">
                <div>
                  {{ title(b.t) }}
                  <span class="uq-badge">{{ b.kind === 'query' ? 'Query' : 'Link' }}</span>
                  <span v-if="isNew(b.t.id)" class="uq-badge" style="color: #36c;">new</span>
                </div>
                <div class="uq-meta">
                  Shown for {{ describe(b.t) }}
                  <template v-if="exampleUrl(b.t)"> · <a :href="exampleUrl(b.t)">see it on {{ b.t.example }}</a></template>
                </div>
              </div>
              <div class="uq-actions">
                <cdx-toggle-switch
                  :model-value="isOn(b.t.id)"
                  :aria-label="(isOn(b.t.id) ? 'Hide ' : 'Show ') + b.t.title"
                  @update:model-value="setOn(b.t.id, $event)"
                ></cdx-toggle-switch>
              </div>
            </li>
          </ul>
        </template>

        <h2>Import from another user</h2>
        <p class="uq-meta">Copy buttons someone else made. You get a copy; later changes on their side don't reach you.</p>
        <div class="uq-row">
          <cdx-text-input v-model="importUser" placeholder="Username" @keydown.enter.prevent="loadImport"></cdx-text-input>
          <cdx-button :disabled="!importUser.trim()" @click="loadImport">Show their buttons</cdx-button>
        </div>
        <cdx-message v-if="importStatus" :type="importStatus.type" :inline="true" style="margin-top: 8px;">{{ importStatus.text }}</cdx-message>
        <ul v-if="importList.length" class="uq-list">
          <li v-for="e in importList" :key="e.kind + ':' + e.t.id" class="uq-item">
            <cdx-checkbox v-model="importPicked" :input-value="e.kind + ':' + e.t.id">
              {{ e.t.emoji }} {{ title(e.t) }}
              <template #description>Shown for {{ describe(e.t) }}</template>
            </cdx-checkbox>
          </li>
        </ul>
        <cdx-button v-if="importList.length" :disabled="!importPicked.length" @click="addImported">Add selected</cdx-button>

        <div class="uq-bar">
          <cdx-button action="progressive" weight="primary" :disabled="!dirty || saving" @click="save">
            {{ saving ? 'Saving…' : 'Save' }}
          </cdx-button>
          <span class="uq-meta" v-if="!dirty">All changes saved.</span>
          <span class="uq-meta" v-else-if="!exists">Not saved yet — saving creates your config page.</span>
          <span class="uq-meta" v-else>Unsaved changes.</span>
          <cdx-message v-if="saveError" type="error" :inline="true">{{ saveError }}</cdx-message>
        </div>
      </div>
    `,
  });

  for (const name of SETTINGS_COMPONENTS) app.component(name, Codex[name]);
  app.mount(mountPoint);
}

// ===== MAIN =====

// The item page being shown, kept so the buttons can be redrawn when the
// user's config or edit mode changes.
const _page = { entityData: null, context: null, $title: null };

// The logged-in user's validated config, or null before it has loaded (and
// for logged-out visitors).
let _userConfig = null;

/**
 * Activate a config: built-ins minus the hidden ones, plus the user's own.
 * Redraws the buttons if the page is already processed.
 * @param {Object} config - A validated config
 */
function applyUserConfig(config) {
  _userConfig = config;
  setActiveTemplates(
    mergeTemplates(USEFUL_QUERIES, config.queries, config.disabled),
    mergeTemplates(USEFUL_LINKS, config.links, config.disabled),
  );
  if (_page.entityData) renderButtons();
}

/** Draw (or redraw) every button on the current item page. */
function renderButtons() {
  clearButtons();
  processEntityFeatures(_page.$title, _page.context);
  Object.entries(_page.entityData.claims).forEach(([propertyId, claims]) => {
    processPropertyClaims(propertyId, claims, _page.context);
  });
  mountButtons();
}

/**
 * Load the user's config. Never rejects: on any problem the built-ins are
 * used, so a broken config page can't break the script.
 * @returns {Promise<void>}
 */
function loadOwnConfig() {
  if (!canConfigure()) return Promise.resolve();
  return Promise.resolve(loadConfig()).then(
    function (loaded) {
      applyUserConfig(loaded.config);
      if (loaded.errors.length) {
        mw.notify(
          $("<span>").append(
            SETTINGS.displayName + ": " + loaded.errors.length + " problem(s) in your config; those entries are skipped. ",
            $("<a>").attr("href", mw.util.getUrl(settingsPageTitle())).text("Open settings"),
          ),
          { type: "warn", tag: "usefulqueries-config" },
        );
      }
    },
    function () {
      // Network/API trouble: carry on with the built-ins.
    },
  );
}

/** Tools-menu entries on item pages. */
function addItemPortletLinks() {
  mw.loader.using("mediawiki.util").then(function () {
    const link = mw.util.addPortletLink(
      "p-tb",
      "#",
      SETTINGS.displayName + ": edit buttons",
      "t-usefulqueries-edit-" + SETTINGS.configName,
      "Add your own usefulQueries buttons on this page, or hide built-in ones",
    );
    if (link) {
      $(link).on("click", function (e) {
        e.preventDefault();
        if (_page.entityData) toggleEditMode();
      });
    }
  });
  addSettingsPortletLink();
}

/**
 * Main function to orchestrate the processing of the Wikibase entity page
 */
function processWikibaseEntityPage() {
  const configReady = loadOwnConfig();

  mw.hook("wikibase.entityPage.entityLoaded").add(function (entityData) {
    if (entityData.type !== "item") {
      return;
    }

    const userLanguage = mw.config.get("wgUserLanguage");
    const $titleElement = getTitleElement();
    const itemLabel = getItemLabel(entityData, userLanguage);

    // The hook remembers its last firing, so this also runs when the config
    // loads after the entity.
    configReady.then(function () {
      _page.entityData = entityData;
      _page.$title = $titleElement;
      _page.context = {
        itemId: entityData.id,
        itemLabel: itemLabel,
        userLanguage: userLanguage,
      };
      renderButtons();

      if (canConfigure()) {
        addItemPortletLinks();
        // Deep link from the settings page: ?usefulqueries-edit=<id>
        const editId = mw.util.getParamValue("usefulqueries-edit");
        if (editId && _userConfig) {
          const kind = _userConfig.queries.some((t) => t.id === editId) ? "query" : "link";
          openTemplateEditor(null, { kind, id: editId });
        }
      }
    });
  });
}

// Initialize the main processing
if (ON_SETTINGS_PAGE) {
  renderSettingsPage();
} else if (ON_CONFIG_PAGE) {
  addSettingsPortletLink();
} else {
  processWikibaseEntityPage();
}
});
