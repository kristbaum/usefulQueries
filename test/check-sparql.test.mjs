import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { checkSparql } from "../scripts/check-sparql.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");

/** Assert that the checks reject `lines`, and that the reason mentions `hint`. */
function rejects(lines, hint) {
  const errors = checkSparql(lines);
  assert.ok(errors.length > 0, `expected a problem, got none for:\n${lines.join("\n")}`);
  assert.ok(
    errors.some((e) => e.includes(hint)),
    `expected a problem mentioning "${hint}", got: ${JSON.stringify(errors)}`,
  );
}

function accepts(lines) {
  assert.deepEqual(checkSparql(lines), []);
}

test("the label service must be the last pattern in the WHERE clause", () => {
  rejects(
    [
      "SELECT ?x WHERE {",
      '  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }',
      "  ?x wdt:P31 wd:Q5.",
      "}",
    ],
    "must be the last pattern",
  );

  accepts([
    "SELECT ?x WHERE {",
    "  ?x wdt:P31 wd:Q5.",
    '  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }',
    "}",
  ]);
});

test("solution modifiers and comments may follow the label service", () => {
  accepts([
    "SELECT ?x ?date WHERE {",
    "  ?x wdt:P569 ?date.",
    '  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }',
    "  # trailing comments are not patterns",
    "}",
    "ORDER BY DESC(?date)",
    "LIMIT 100",
  ]);
});

test("a query without a label service is not second-guessed", () => {
  accepts(["SELECT ?x WHERE {", "  ?x wdt:P31 wd:Q5.", "}"]);
});

test("an OPTIONAL holding two unconnected patterns is rejected", () => {
  // The example from AGENTS.md: QLever materialises the cross product of two
  // 6M-row relations.
  rejects(
    [
      "SELECT ?a ?b WHERE {",
      "  ?a wdt:P31 ?b.",
      "  OPTIONAL { ?node wdt:P18 ?nodeImage. ?childNode wdt:P18 ?childImage. }",
      "}",
    ],
    "share no variable",
  );
});

test("one OPTIONAL per pattern is accepted", () => {
  accepts([
    "SELECT ?a ?b WHERE {",
    "  ?a wdt:P31 ?b.",
    "  OPTIONAL { ?node wdt:P18 ?nodeImage. }",
    "  OPTIONAL { ?childNode wdt:P18 ?childImage. }",
    "}",
  ]);
});

test("patterns joined by a shared variable stay one OPTIONAL", () => {
  accepts([
    "SELECT ?item ?housenumber WHERE {",
    "  ?item wdt:P669 wd:Q1.",
    "  OPTIONAL {",
    "    ?item p:P669 ?number.",
    "    ?number pq:P670 ?housenumber.",
    "  }",
    "}",
  ]);
});

test("a semicolon continuation is not read as a second pattern", () => {
  accepts([
    "SELECT ?w WHERE {",
    "  ?w wdt:P31 wd:Q5.",
    "  OPTIONAL {",
    "    ?w wdt:P569 ?born;",
    "      wdt:P570 ?died.",
    "  }",
    "}",
  ]);
});

test("a BIND that consumes the pattern's variable keeps the block connected", () => {
  accepts([
    "SELECT ?work ?url WHERE {",
    "  ?work wdt:P31 wd:Q5.",
    "  OPTIONAL {",
    "    ?work wdt:P10626 ?id.",
    '    BIND(IRI(CONCAT("https://www.deckenmalerei.eu/", ?id)) AS ?url)',
    "  }",
    "}",
  ]);
});

test("decimals and dotted IRIs do not split a pattern", () => {
  accepts([
    "SELECT ?p WHERE {",
    "  ?p wdt:P625 ?coord.",
    "  OPTIONAL {",
    '    ?p wdt:P2044 ?elev.',
    "    FILTER(?elev > 1.5)",
    "  }",
    "}",
  ]);
});

test("the same OPTIONAL repeated per UNION arm is rejected", () => {
  rejects(
    [
      "SELECT ?place WHERE {",
      "  {",
      "    wd:Q64 wdt:P190 ?place.",
      "    OPTIONAL { ?place wdt:P18 ?image. }",
      "  }",
      "  UNION",
      "  {",
      "    wd:Q64 wdt:P47 ?place.",
      "    OPTIONAL { ?place wdt:P18 ?image. }",
      "  }",
      "}",
    ],
    "hoist a single copy",
  );
});

test("every shipped query template satisfies the portability rules", async () => {
  const dir = path.join(repoRoot, "templates", "queries");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  assert.ok(files.length > 0, "no query templates found");

  const problems = [];
  for (const file of files) {
    const tpl = JSON.parse(await readFile(path.join(dir, file), "utf8"));
    for (const error of checkSparql(tpl.template)) {
      problems.push(`${file}: ${error}`);
    }
  }
  assert.deepEqual(problems, []);
});
