import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQueryPrompt, formatButtonHeader, splitButtonHeader } from "../src/shared/llm-prompt.mjs";

function valueSpot(overrides = {}) {
  return {
    request: "Other people born in this place",
    scope: "value",
    section: "statement",
    propertyId: "P19",
    propertyLabel: "place of birth",
    propertyIds: ["P19"],
    valueIds: [],
    valueLabel: "Cambridge",
    placeholders: ["itemId", "itemLabel", "userLanguage", "propertyId", "valueId", "valueSparql", "valueLabel", "valueLatitude", "valueLongitude"],
    context: {
      itemId: "Q42", itemLabel: "Douglas Adams", userLanguage: "en", propertyId: "P19",
      valueId: "Q350", valueSparql: "wd:Q350", valueLabel: "Cambridge", valueLatitude: "", valueLongitude: "",
    },
    itemId: "Q42",
    itemLabel: "Douglas Adams",
    wikiName: "Wikidata",
    queryServiceUrl: "https://query.wikidata.org/",
    guideUrl: "https://example.org/TEMPLATE_GUIDE.md",
    ...overrides,
  };
}

test("the user's request comes first", () => {
  const prompt = buildQueryPrompt(valueSpot());
  const lines = prompt.split("\n");
  assert.equal(lines[2], "Other people born in this place");
  assert.ok(prompt.indexOf("Other people born") < prompt.indexOf("## Background"));
});

test("an empty request leaves a visible gap to fill in", () => {
  assert.match(buildQueryPrompt(valueSpot({ request: "  " })), /\(describe here what the button should show\)/);
});

test("lists the placeholders with their values on this item", () => {
  const prompt = buildQueryPrompt(valueSpot());
  assert.match(prompt, /^- \{valueId\} \[Q350\]: ID of the object/m);
  assert.match(prompt, /^- \{itemLabel\} \[Douglas Adams\]/m);
  assert.match(prompt, /^- \{valueLatitude\} \[empty here\]/m);
});

test("offers only the placeholders it is given", () => {
  const prompt = buildQueryPrompt(
    valueSpot({ scope: "entity", placeholders: ["itemId", "itemLabel", "userLanguage"] }),
  );
  assert.doesNotMatch(prompt, /^- \{valueId\}/m);
  assert.doesNotMatch(prompt, /^- \{propertyId\}/m);
  assert.match(prompt, /on every item/);
});

test("describes the three placements of a statement button", () => {
  assert.match(buildQueryPrompt(valueSpot()), /each value of “place of birth” \(P19\), e\.g\. “Cambridge”/);
  assert.match(
    buildQueryPrompt(valueSpot({ propertyId: "P106", propertyLabel: "occupation", valueIds: ["Q1028181"] })),
    /only when its value is Q1028181\. The value only decides whether the button shows/,
  );
  const property = buildQueryPrompt(valueSpot({ scope: "property" }));
  assert.match(property, /Once, next to the property “place of birth”/);
  assert.match(property, /Don't read the property's values back out of the item/);
});

test("names the statement of a qualifier button", () => {
  const prompt = buildQueryPrompt(
    valueSpot({
      section: "qualifiers",
      propertyId: "P768",
      propertyLabel: "electoral district",
      statementText: "position held → member of the Bundestag",
    }),
  );
  assert.match(prompt, /each qualifier value of “electoral district” \(P768\).* of the statement “position held → member of the Bundestag”/);
});

test("the title example only uses a placeholder available at this spot", () => {
  // Property button on a qualifier: no {valueLabel} here.
  const prompt = buildQueryPrompt(
    valueSpot({
      scope: "property",
      section: "qualifiers",
      placeholders: ["itemId", "itemLabel", "userLanguage", "propertyId", "statementPropertyId", "statementValueId", "statementValueSparql", "statementValueLabel"],
    }),
  );
  assert.doesNotMatch(prompt, /\{valueLabel\}/);
  assert.match(prompt, /exactly the placeholders listed above\. .*don't invent one\. For example \{statementValueLabel\}/);
  assert.match(buildQueryPrompt(valueSpot()), /For example \{valueLabel\}/);
});

test("mentions {propertyId} when several properties trigger the button", () => {
  assert.match(buildQueryPrompt(valueSpot({ propertyIds: ["P19", "P20"] })), /any of these properties: P19, P20/);
  assert.doesNotMatch(buildQueryPrompt(valueSpot()), /any of these properties/);
});

test("carries the query rules the build enforces", () => {
  const prompt = buildQueryPrompt(valueSpot());
  assert.match(prompt, /\[AUTO_LANGUAGE\],mul,en/);
  assert.match(prompt, /LIMIT/);
  assert.match(prompt, /two unconnected patterns in one OPTIONAL/);
  assert.match(prompt, /never write one from memory/);
});

test("includes the current query and the guide link when given", () => {
  const without = buildQueryPrompt(valueSpot({ guideUrl: undefined }));
  assert.doesNotMatch(without, /Current button/);
  assert.doesNotMatch(without, /full guide/);
  const prompt = buildQueryPrompt(valueSpot({ currentQuery: "SELECT ?p WHERE { ?p wdt:P19 wd:{valueId}. }\n" }));
  assert.match(prompt, /## Current button \(improve on this\)\n\n```sparql\nSELECT \?p WHERE \{ \?p wdt:P19 wd:\{valueId\}\. \}\n```/);
  assert.match(prompt, /full guide.*https:\/\/example\.org\/TEMPLATE_GUIDE\.md/);
});

test("warns that bare-ID placeholders need a prefix", () => {
  assert.match(buildQueryPrompt(valueSpot()), /always need a prefix.*Never write one on its own/);
});

test("asks for the title and emoji as the first lines of the query", () => {
  const prompt = buildQueryPrompt(valueSpot());
  assert.match(prompt, /```sparql\n#title: <[^>]+>\n#emoji: <[^>]+>\n/);
});

test("the current button carries its title and emoji in the same format", () => {
  const prompt = buildQueryPrompt(
    valueSpot({ currentQuery: "SELECT ?p WHERE { ?p wdt:P19 wd:{valueId}. }", currentTitle: "Born in {valueLabel}", currentEmoji: "👶" }),
  );
  assert.match(prompt, /```sparql\n#title: Born in \{valueLabel\}\n#emoji: 👶\nSELECT/);
});

test("splitButtonHeader reads and removes the header lines", () => {
  const r = splitButtonHeader("#title: Born in {valueLabel}\n#emoji: 👶\n#defaultView:ImageGrid\nSELECT ?p WHERE {}\n");
  assert.deepEqual(r, {
    text: "#defaultView:ImageGrid\nSELECT ?p WHERE {}",
    title: "Born in {valueLabel}",
    emoji: "👶",
    found: true,
  });
});

test("splitButtonHeader drops a code fence and tolerates spacing, case and order", () => {
  const r = splitButtonHeader("```sparql\r\n\n  # Emoji :  🗺️ \n#TITLE: Map\nSELECT ?x WHERE {}\n```\n");
  assert.equal(r.title, "Map");
  assert.equal(r.emoji, "🗺️");
  assert.equal(r.text, "SELECT ?x WHERE {}");
});

test("splitButtonHeader leaves other text alone", () => {
  const plain = "#defaultView:Map\n#title: not a header here\nSELECT ?x WHERE {}";
  assert.deepEqual(splitButtonHeader(plain), { text: plain, title: null, emoji: null, found: false });
  // Only one of the two lines, or an empty value.
  assert.equal(splitButtonHeader("#emoji: 🔍\nSELECT 1").title, null);
  assert.equal(splitButtonHeader("#emoji: 🔍\nSELECT 1").text, "SELECT 1");
  assert.equal(splitButtonHeader("#title:\nSELECT 1").found, false);
});

test("formatButtonHeader round-trips through splitButtonHeader", () => {
  const text = [...formatButtonHeader(" People ", "👥"), "SELECT 1"].join("\n");
  assert.deepEqual(splitButtonHeader(text), { text: "SELECT 1", title: "People", emoji: "👥", found: true });
  assert.deepEqual(formatButtonHeader("", " "), []);
});
