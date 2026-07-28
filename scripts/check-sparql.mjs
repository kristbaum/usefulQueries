// Build-time SPARQL portability checks for templates/queries/*.json.
//
// The schema checks in validate-templates.mjs catch templates that never show
// up. These catch templates that show up and then time out: every query here is
// also offered as a QLever link, and the two engines plan SPARQL very
// differently. The rules encoded below are the ones written up in AGENTS.md
// under "Writing queries that run on both WDQS and QLever".
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
  const svc = lines.findIndex((l) => /SERVICE\s+wikibase:label/i.test(l));
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
export function checkSparql(lines) {
  const query = lines.map(stripComment).join("\n");
  return [
    ...checkLabelServiceLast(lines),
    ...checkOptionalsConnected(query),
    ...checkNoDuplicateOptionals(query),
  ];
}
