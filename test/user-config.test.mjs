import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyConfig,
  generalizeQuery,
  importTemplates,
  makeTemplateId,
  mergeTemplates,
  parseUserConfig,
  queryFromServiceUrl,
  serializeConfig,
  suggestionIssueUrl,
  validateUserConfig,
} from "../src/shared/user-config.mjs";

function userQuery(overrides = {}) {
  return {
    id: "u_bornHere",
    example: "Q64",
    scope: "value",
    propertyId: ["P19"],
    template: ["SELECT ?p WHERE { ?p wdt:P19 wd:{valueId}. }"],
    emoji: "👶",
    title: "Born in {valueLabel}",
    ...overrides,
  };
}

test("a missing page gives an empty config that has seen every built-in", () => {
  const result = parseUserConfig(null, ["a", "b"]);
  assert.equal(result.exists, false);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.config, emptyConfig(["a", "b"]));
});

test("invalid JSON is reported, not thrown", () => {
  const result = parseUserConfig("{nope", ["a"]);
  assert.equal(result.exists, true);
  assert.match(result.errors[0], /^not valid JSON/);
  assert.deepEqual(result.config.queries, []);
});

test("invalid templates are dropped, valid ones kept", () => {
  const { config, errors } = validateUserConfig({
    disabled: ["a"],
    queries: [userQuery(), userQuery({ id: "u_bad", scope: "entity" })],
    links: [],
  });
  assert.deepEqual(config.queries.map((t) => t.id), ["u_bornHere"]);
  assert.deepEqual(config.disabled, ["a"]);
  assert.ok(errors.length >= 1);
  assert.ok(errors.every((e) => e.startsWith('queries[1] "u_bad"')));
});

test("link templates must still be http(s) — no javascript: URLs from a config page", () => {
  const { config, errors } = validateUserConfig({
    links: [
      {
        id: "u_evil",
        example: "Q1",
        scope: "entity",
        urlTemplate: "javascript:alert(1)",
        emoji: "x",
        title: "x",
      },
    ],
  });
  assert.deepEqual(config.links, []);
  assert.equal(errors.length, 1);
});

test("user templates may not reuse built-in ids or each other's", () => {
  const { config, errors } = validateUserConfig(
    { queries: [userQuery({ id: "builtin" }), userQuery(), userQuery()] },
    ["builtin"],
  );
  assert.deepEqual(config.queries.map((t) => t.id), ["u_bornHere"]);
  assert.equal(errors.length, 2);
});

test("SPARQL portability rules are not enforced on user templates", () => {
  const { config } = validateUserConfig({
    queries: [
      userQuery({
        template: [
          "SELECT ?p WHERE {",
          '  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }',
          "  ?p wdt:P19 wd:{valueId}.",
          "}",
        ],
      }),
    ],
  });
  assert.equal(config.queries.length, 1);
});

test("non-list fields are reported", () => {
  const { errors } = validateUserConfig({ disabled: "a", queries: {} });
  assert.equal(errors.length, 2);
});

test("serialise → parse round-trips", () => {
  const config = { ...emptyConfig(["a"]), disabled: ["a"], queries: [userQuery()] };
  const again = parseUserConfig(serializeConfig(config), ["a"]);
  assert.deepEqual(again.errors, []);
  assert.deepEqual(again.config, config);
});

test("merge hides disabled built-ins and joins user SPARQL lines", () => {
  const builtins = [
    { id: "a", template: "x" },
    { id: "b", template: "y" },
  ];
  const merged = mergeTemplates(builtins, [userQuery({ template: ["L1", "L2"] })], ["a"]);
  assert.deepEqual(merged.map((t) => t.id), ["b", "u_bornHere"]);
  assert.equal(merged[1].template, "L1\nL2");
});

test("queries are read from Query Service links", () => {
  const q = "SELECT * WHERE { ?s ?p ?o }";
  assert.equal(queryFromServiceUrl("https://query.wikidata.org/#" + encodeURIComponent(q)), q);
  assert.equal(queryFromServiceUrl("https://query.wikidata.org/embed.html#" + encodeURIComponent(q)), q);
  assert.equal(queryFromServiceUrl("https://example.org/#query=" + encodeURIComponent(q)), q);
  assert.equal(queryFromServiceUrl("https://w.wiki/ABC"), null);
  assert.equal(queryFromServiceUrl("https://query.wikidata.org/#%E0%A4%A"), null);
});

test("generalising swaps whole IDs only", () => {
  const { text, replacements } = generalizeQuery(
    "SELECT ?p WHERE { ?p wdt:P19 wd:Q64. FILTER(?p != wd:Q42) ?x wdt:P31 wd:Q640. wd:Q42 wdt:P1 ?y }",
    { itemId: "Q42", valueId: "Q64", valueSparql: "wd:Q64" },
  );
  assert.equal(
    text,
    "SELECT ?p WHERE { ?p wdt:P19 wd:{valueId}. FILTER(?p != wd:{itemId}) ?x wdt:P31 wd:Q640. wd:{itemId} wdt:P1 ?y }",
  );
  assert.deepEqual(replacements, [
    { from: "Q64", to: "{valueId}", count: 1 },
    { from: "Q42", to: "{itemId}", count: 2 },
  ]);
});

test("generalising handles string values and missing values", () => {
  assert.equal(
    generalizeQuery('SELECT ?x WHERE { ?x wdt:P214 "113230702" }', {
      itemId: "Q1",
      valueId: null,
      valueSparql: '"113230702"',
    }).text,
    "SELECT ?x WHERE { ?x wdt:P214 {valueSparql} }",
  );
  assert.equal(generalizeQuery("wd:Q1", { itemId: "Q1" }).text, "wd:{itemId}");
});

test("generalising a qualifier query also swaps the statement's value", () => {
  const { text } = generalizeQuery(
    "SELECT ?p WHERE { ?p p:P39 ?s. ?s ps:P39 wd:Q1939555; pq:P768 wd:Q1008651. FILTER(?p != wd:Q567) }",
    { itemId: "Q567", valueId: "Q1008651", valueSparql: "wd:Q1008651", statementValueId: "Q1939555" },
  );
  assert.equal(
    text,
    "SELECT ?p WHERE { ?p p:P39 ?s. ?s ps:P39 wd:{statementValueId}; pq:P768 wd:{valueId}. FILTER(?p != wd:{itemId}) }",
  );
});

test("new ids are readable, prefixed and unique", () => {
  assert.equal(makeTemplateId("People born in {valueLabel}", []), "u_peopleBornIn");
  assert.equal(makeTemplateId("People born in", ["u_peopleBornIn"]), "u_peopleBornIn2");
  assert.equal(makeTemplateId("🔥", []), "u_button");
});

test("importing renames ids that are taken and leaves the original alone", () => {
  const config = { ...emptyConfig(), queries: [userQuery()] };
  const next = importTemplates(
    config,
    [
      { kind: "query", template: userQuery() },
      { kind: "query", template: userQuery({ id: "builtin", title: "Other" }) },
      { kind: "link", template: { id: "u_link", title: "L" } },
    ],
    ["builtin"],
  );
  assert.deepEqual(next.queries.map((t) => t.id), ["u_bornHere", "u_bornIn", "u_other"]);
  assert.deepEqual(next.links.map((t) => t.id), ["u_link"]);
  assert.equal(config.queries.length, 1);
});

test("suggestion links carry the template as JSON", () => {
  const url = suggestionIssueUrl(userQuery(), "query", "https://github.com/x/y");
  assert.ok(url.startsWith("https://github.com/x/y/issues/new?title="));
  const body = decodeURIComponent(url.split("&body=")[1]);
  assert.match(body, /templates\/queries\/bornHere\.json/);
  assert.match(body, /"u_bornHere"/);
});
