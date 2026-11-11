import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyConfig,
  findOverride,
  generalizeQuery,
  importTemplates,
  keepSkipped,
  makeOverride,
  makeTemplateId,
  mergeTemplates,
  overriddenIds,
  parseTemplateJson,
  parseUserConfig,
  queryFromServiceUrl,
  removeTemplate,
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

test("removeTemplate drops the id from whichever list holds it", () => {
  const config = { ...emptyConfig(), queries: [userQuery()], links: [{ id: "u_link" }] };
  removeTemplate(config, "u_link");
  assert.deepEqual(config.links, []);
  assert.equal(config.queries.length, 1);
  removeTemplate(config, "u_bornHere");
  assert.deepEqual(config.queries, []);
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

test("invalid entries are skipped but kept for writing back", () => {
  const broken = userQuery({ id: "u_broken", template: ["SELECT ?s WHERE { ?s ps:P937 {valueId}. }"] });
  const { config, skipped } = validateUserConfig({ queries: [userQuery(), broken], links: [{ nonsense: true }] });
  assert.deepEqual(config.queries.map((t) => t.id), ["u_bornHere"]);
  assert.deepEqual(skipped, { queries: [broken], links: [{ nonsense: true }] });
});

test("keepSkipped puts invalid entries back unless their id is taken", () => {
  const config = emptyConfig();
  config.queries.push(userQuery({ id: "u_fixed" }));
  const skipped = {
    queries: [{ id: "u_fixed", broken: true }, { id: "u_stillBroken", broken: true }, "junk"],
    links: [],
  };
  keepSkipped(config, skipped);
  assert.deepEqual(config.queries.map((t) => (typeof t === "string" ? t : t.id)), ["u_fixed", "u_stillBroken", "junk"]);
  assert.equal(config.queries[0].broken, undefined);
  assert.equal(keepSkipped(config, undefined), config);
});

test("a modified built-in is a user template with basedOn", () => {
  const override = userQuery({ id: "u_a", basedOn: "a" });
  const { config, errors } = validateUserConfig({ queries: [override] }, ["a"]);
  assert.deepEqual(errors, []);
  assert.deepEqual(overriddenIds(config), ["a"]);
  assert.deepEqual(findOverride(config, "a"), { kind: "query", template: override });
  assert.equal(findOverride(config, "b"), null);
  const again = parseUserConfig(serializeConfig(config), ["a"]);
  assert.equal(again.config.queries[0].basedOn, "a");
});

test("basedOn must be a string and used once", () => {
  const { config, errors } = validateUserConfig(
    {
      queries: [
        userQuery({ id: "u_a", basedOn: "a" }),
        userQuery({ id: "u_a2", basedOn: "a" }),
        userQuery({ id: "u_x", basedOn: 5 }),
      ],
    },
    ["a"],
  );
  assert.deepEqual(config.queries.map((t) => t.id), ["u_a"]);
  assert.equal(errors.length, 2);
});

test("a modified built-in replaces it, and hides with it", () => {
  const builtins = [
    { id: "a", template: "x" },
    { id: "b", template: "y" },
  ];
  const user = [userQuery({ id: "u_a", basedOn: "a" })];
  assert.deepEqual(mergeTemplates(builtins, user, [], ["a"]).map((t) => t.id), ["b", "u_a"]);
  assert.deepEqual(mergeTemplates(builtins, user, ["a"], ["a"]).map((t) => t.id), ["b"]);
});

test("makeOverride copies a built-in into JSON form with a fresh id", () => {
  const builtin = { id: "a", scope: "entity", template: "L1\nL2", emoji: "x", title: "T" };
  const copy = makeOverride(builtin, ["a", "u_a"]);
  assert.equal(copy.id, "u_a2");
  assert.equal(copy.basedOn, "a");
  assert.deepEqual(copy.template, ["L1", "L2"]);
  assert.equal(builtin.template, "L1\nL2");
});

test("imports drop basedOn; suggestions of a modified built-in target its file", () => {
  const next = importTemplates(emptyConfig(), [{ kind: "query", template: userQuery({ id: "u_a", basedOn: "a" }) }], ["a"]);
  assert.equal(next.queries[0].basedOn, undefined);
  const body = decodeURIComponent(
    suggestionIssueUrl(userQuery({ id: "u_a", basedOn: "a" }), "query", "https://x").split("&body=")[1],
  );
  assert.match(body, /File: `templates\/queries\/a\.json`/);
  assert.match(body, /"id": "a"/);
  assert.doesNotMatch(body, /basedOn/);
});

test("pasted JSON: a template file fills in a button", () => {
  const tpl = userQuery({ basedOn: "a", extra: 1 });
  const parsed = parseTemplateJson("```json\n" + JSON.stringify(tpl, null, 2) + "\n```");
  assert.equal(parsed.found, true);
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.kind, "query");
  assert.deepEqual(parsed.ignored, ["extra"]);
  assert.equal(parsed.template.id, undefined);
  assert.equal(parsed.template.basedOn, undefined);
  assert.deepEqual(parsed.template.propertyId, ["P19"]);
  assert.deepEqual(parsed.template.template, tpl.template);
  assert.equal(parsed.example, "Q64");
  assert.equal(parseTemplateJson(JSON.stringify({ template: ["x"], example: "nope" })).example, null);
});

test("pasted JSON: links, one-string queries and one-button configs", () => {
  const link = parseTemplateJson(JSON.stringify({ scope: "entity", urlTemplate: "https://x/{itemId}", emoji: "🔗", title: "X" }));
  assert.equal(link.kind, "link");
  assert.equal(link.template.urlTemplate, "https://x/{itemId}");
  const oneString = parseTemplateJson(JSON.stringify({ template: "L1\nL2", propertyId: "P19" }));
  assert.deepEqual(oneString.template.template, ["L1", "L2"]);
  assert.deepEqual(oneString.template.propertyId, ["P19"]);
  const config = parseTemplateJson(serializeConfig({ ...emptyConfig(), queries: [userQuery()] }));
  assert.equal(config.kind, "query");
  assert.equal(config.template.title, userQuery().title);
});

test("pasted JSON: problems are reported, non-JSON is left alone", () => {
  assert.deepEqual(parseTemplateJson("SELECT * WHERE { ?s ?p ?o }"), { found: false });
  assert.deepEqual(parseTemplateJson("https://query.wikidata.org/#SELECT"), { found: false });
  assert.match(parseTemplateJson("{ nope").error, /isn't valid/);
  assert.match(parseTemplateJson("{}").error, /"template"/);
  assert.match(parseTemplateJson(JSON.stringify({ template: ["x"], urlTemplate: "y" })).error, /not both/);
  assert.match(parseTemplateJson(JSON.stringify({ template: [1] })).error, /list of lines/);
  assert.match(parseTemplateJson(JSON.stringify({ template: ["x"], valueId: [5] })).error, /"valueId"/);
  const two = serializeConfig({ ...emptyConfig(), queries: [userQuery(), userQuery({ id: "u_b" })] });
  assert.match(parseTemplateJson(two).error, /2 buttons/);
});
