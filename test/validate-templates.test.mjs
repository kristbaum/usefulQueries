import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { validateTemplate } from "../scripts/validate-templates.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");

/**
 * Apply overrides, treating an `undefined` override as "field absent" — JSON
 * files can never carry an undefined value, so neither should the fixtures.
 */
function withOverrides(base, overrides) {
  const result = { ...base, ...overrides };
  for (const [key, value] of Object.entries(result)) {
    if (value === undefined) delete result[key];
  }
  return result;
}

/** A minimal template that must pass, used as the base for mutation tests. */
function validQuery(overrides = {}) {
  return withOverrides(
    {
      id: "example",
      example: "Q42",
      scope: "property",
      propertyId: ["P106"],
      template: ["SELECT ?x WHERE { wd:{itemQid} wdt:P31 ?x. }"],
      emoji: "🔍",
      title: "Example for {itemLabel}",
    },
    overrides,
  );
}

function validLink(overrides = {}) {
  return withOverrides(
    {
      id: "example",
      example: "Q42",
      scope: "property",
      propertyId: ["P106"],
      urlTemplate: "https://example.org/{itemQid}",
      emoji: "🔗",
      title: "Example",
    },
    overrides,
  );
}

/** Assert the template is rejected, with a message mentioning `needle`. */
function assertRejected(tpl, kind, needle) {
  const errors = validateTemplate(tpl, kind);
  assert.ok(
    errors.length > 0,
    `expected ${JSON.stringify(tpl)} to be rejected`,
  );
  assert.ok(
    errors.some((e) => e.includes(needle)),
    `expected an error mentioning "${needle}", got: ${errors.join(" | ")}`,
  );
}

test("the shipped templates are all valid", async () => {
  const dirs = [
    ["templates/queries", "query"],
    ["templates/links", "link"],
    ["ReSaNode/templates/queries", "query"],
    ["ReSaNode/templates/links", "link"],
  ];

  for (const [dir, kind] of dirs) {
    let files;
    try {
      files = await readdir(path.join(repoRoot, dir));
    } catch {
      continue; // optional directory (e.g. ReSaNode has no links)
    }
    for (const file of files.filter((f) => f.endsWith(".json"))) {
      const raw = await readFile(path.join(repoRoot, dir, file), "utf8");
      const errors = validateTemplate(JSON.parse(raw), kind);
      assert.deepEqual(errors, [], `${dir}/${file} should be valid`);
    }
  }
});

test("baseline fixtures are valid", () => {
  assert.deepEqual(validateTemplate(validQuery(), "query"), []);
  assert.deepEqual(validateTemplate(validLink(), "link"), []);
});

test("scope must be a known value", () => {
  assertRejected(validQuery({ scope: "statement" }), "query", '"scope"');
  assertRejected(validQuery({ scope: undefined }), "query", '"scope"');
});

test("propertyId is required for property and value scope", () => {
  assertRejected(
    validQuery({ propertyId: undefined }),
    "query",
    '"propertyId"',
  );
  assertRejected(validQuery({ propertyId: [] }), "query", '"propertyId"');
  // A bare string is the easy mistake — the runtime index expects an array.
  assertRejected(validQuery({ propertyId: "P106" }), "query", '"propertyId"');
  assertRejected(validQuery({ propertyId: ["Q106"] }), "query", "P123");
});

test("entity scope takes no propertyId", () => {
  const entity = validQuery({ scope: "entity", propertyId: undefined });
  assert.deepEqual(validateTemplate(entity, "query"), []);
  assertRejected(
    validQuery({ scope: "entity", propertyId: ["P106"] }),
    "query",
    '"propertyId"',
  );
});

test("valueId accepts QID arrays or null, and only on value scope", () => {
  const anyValue = validQuery({ scope: "value", valueId: null });
  assert.deepEqual(validateTemplate(anyValue, "query"), []);

  const specific = validQuery({ scope: "value", valueId: ["Q1028181"] });
  assert.deepEqual(validateTemplate(specific, "query"), []);

  assertRejected(
    validQuery({ scope: "value", valueId: ["P1028181"] }),
    "query",
    "Q123",
  );
  assertRejected(
    validQuery({ scope: "property", valueId: ["Q1028181"] }),
    "query",
    '"valueId"',
  );
});

test("unknown fields are rejected", () => {
  // These are the stale names the old typedef documented.
  assertRejected(validQuery({ popupTitle: "x" }), "query", "popupTitle");
  assertRejected(validQuery({ toolhint: "x" }), "query", "toolhint");
  assertRejected(validQuery({ enabled: true }), "query", "enabled");
  // Cross-kind mixups.
  assertRejected(
    validQuery({ urlTemplate: "https://x.org" }),
    "query",
    "urlTemplate",
  );
  assertRejected(
    validLink({ template: ["SELECT ?x WHERE {}"] }),
    "link",
    "template",
  );
});

test("queries need a non-empty array template", () => {
  assertRejected(validQuery({ template: undefined }), "query", '"template"');
  assertRejected(validQuery({ template: [] }), "query", '"template"');
  // A plain string silently becomes a per-character join at build time.
  assertRejected(
    validQuery({ template: "SELECT ?x WHERE {}" }),
    "query",
    '"template"',
  );
});

test("links need an absolute http(s) urlTemplate", () => {
  assertRejected(
    validLink({ urlTemplate: undefined }),
    "link",
    '"urlTemplate"',
  );
  assertRejected(
    validLink({ urlTemplate: "/relative/{itemQid}" }),
    "link",
    "http",
  );
});

test("example must be a QID and is mandatory", () => {
  assertRejected(validQuery({ example: undefined }), "query", '"example"');
  assertRejected(validLink({ example: undefined }), "link", '"example"');
  assertRejected(validQuery({ example: "P42" }), "query", "Q123");
  assertRejected(validQuery({ example: ["Q42"] }), "query", '"example"');
});

test("emoji and title must be present", () => {
  assertRejected(validQuery({ emoji: "" }), "query", '"emoji"');
  assertRejected(validQuery({ title: undefined }), "query", '"title"');
});

test("unknown placeholders are rejected", () => {
  assertRejected(
    validQuery({ template: ["SELECT ?x WHERE { wd:{itemQID} ?p ?x. }"] }),
    "query",
    "{itemQID}",
  );
  assertRejected(
    validQuery({ title: "Works by {creatorLabel}" }),
    "query",
    "{creatorLabel}",
  );
  assertRejected(
    validLink({ urlTemplate: "https://example.org/{qid}" }),
    "link",
    "{qid}",
  );
});

test("value placeholders require value scope", () => {
  const onValue = validQuery({
    scope: "value",
    valueId: null,
    template: ["SELECT ?x WHERE { wd:{valueQid} ?p ?x. }"],
    title: "Others at {valueLabel}",
  });
  assert.deepEqual(validateTemplate(onValue, "query"), []);

  assertRejected(
    validQuery({
      scope: "property",
      template: ["SELECT ?x WHERE { wd:{valueQid} ?p ?x. }"],
    }),
    "query",
    "only available with scope",
  );
});

test("SPARQL braces are not mistaken for placeholders", () => {
  const sparqlHeavy = validQuery({
    template: [
      "SELECT ?item WHERE {",
      "  ?item wdt:P170 wd:{itemQid}.",
      "  OPTIONAL { ?item wdt:P18 ?image. }",
      "  VALUES ?org { wd:Q42 }",
      '  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". }',
      "}",
    ],
  });
  assert.deepEqual(validateTemplate(sparqlHeavy, "query"), []);
});

test("non-objects are rejected", () => {
  assertRejected([], "query", "JSON object");
  assertRejected(null, "query", "JSON object");
  assertRejected("{}", "query", "JSON object");
});
