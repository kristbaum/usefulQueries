import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  SECTION_HEADING,
  loadQueryTemplates,
  renderSection,
  replaceSection,
} from "../scripts/generate-wiki.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");

test("the query overview in usefulQueries.wiki is up to date", async () => {
  const wikitext = await readFile(
    path.join(repoRoot, "usefulQueries.wiki"),
    "utf8",
  );
  const templates = await loadQueryTemplates(
    path.join(repoRoot, "templates", "queries"),
  );

  assert.ok(
    wikitext.includes(renderSection(templates)),
    `${SECTION_HEADING} is stale — run npm run build`,
  );
});

test("every query template shows up in the overview", async () => {
  const templates = await loadQueryTemplates(
    path.join(repoRoot, "templates", "queries"),
  );
  const section = renderSection(templates);

  for (const tpl of templates) {
    assert.ok(section.includes(tpl.file), `${tpl.file} is missing`);
    assert.ok(section.includes(`{{Q|${tpl.example}}}`), `${tpl.id} example`);
  }
});

test("regenerating replaces the section without touching later ones", () => {
  const page = [
    "== Intro ==",
    "",
    "text",
    "",
    SECTION_HEADING,
    "",
    "stale tables",
    "",
    "== Comments ==",
    "",
  ].join("\n");

  const updated = replaceSection(page, `${SECTION_HEADING}\n\nfresh tables`);

  assert.ok(updated.startsWith("== Intro ==\n\ntext\n"));
  assert.ok(updated.includes("fresh tables"));
  assert.ok(!updated.includes("stale tables"));
  assert.ok(updated.endsWith("== Comments ==\n"));
  // Running it again must not change anything further.
  assert.equal(
    replaceSection(updated, `${SECTION_HEADING}\n\nfresh tables`),
    updated,
  );
});

test("a page without the heading gets the section appended", () => {
  const updated = replaceSection("== Intro ==\n\ntext\n", "== Query overview ==");
  assert.ok(updated.endsWith("== Query overview ==\n"));
});
