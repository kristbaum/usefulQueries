import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  QUERY_HEADING,
  LINK_HEADING,
  loadTemplates,
  renderQuerySection,
  renderLinkSection,
  replaceSection,
} from "../scripts/generate-wiki.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");

const readWiki = () =>
  readFile(path.join(repoRoot, "usefulQueries.wiki"), "utf8");
const queries = () =>
  loadTemplates(path.join(repoRoot, "templates", "queries"));
const links = () => loadTemplates(path.join(repoRoot, "templates", "links"));

test("the generated sections in usefulQueries.wiki are up to date", async () => {
  const wikitext = await readWiki();

  assert.ok(
    wikitext.includes(renderQuerySection(await queries())),
    `${QUERY_HEADING} is stale — run npm run build`,
  );
  assert.ok(
    wikitext.includes(renderLinkSection(await links())),
    `${LINK_HEADING} is stale — run npm run build`,
  );
});

test("every query template shows up in the query overview", async () => {
  const templates = await queries();
  const section = renderQuerySection(templates);

  for (const tpl of templates) {
    assert.ok(section.includes(tpl.file), `${tpl.file} is missing`);
    assert.ok(section.includes(`{{Q|${tpl.example}}}`), `${tpl.id} example`);
  }
});

test("every link template shows up in the link overview", async () => {
  const templates = await links();
  const section = renderLinkSection(templates);

  for (const tpl of templates) {
    assert.ok(section.includes(tpl.file), `${tpl.file} is missing`);
    assert.ok(section.includes(tpl.urlTemplate), `${tpl.id} target URL`);
    assert.ok(section.includes(`{{Q|${tpl.example}}}`), `${tpl.id} example`);
  }
});

test("regenerating replaces a section without touching later ones", () => {
  const page = [
    "== Intro ==",
    "",
    "text",
    "",
    QUERY_HEADING,
    "",
    "stale tables",
    "",
    "== Comments ==",
    "",
  ].join("\n");

  const updated = replaceSection(
    page,
    QUERY_HEADING,
    `${QUERY_HEADING}\n\nfresh tables`,
  );

  assert.ok(updated.startsWith("== Intro ==\n\ntext\n"));
  assert.ok(updated.includes("fresh tables"));
  assert.ok(!updated.includes("stale tables"));
  assert.ok(updated.endsWith("== Comments ==\n"));
  // Running it again must not change anything further.
  assert.equal(
    replaceSection(updated, QUERY_HEADING, `${QUERY_HEADING}\n\nfresh tables`),
    updated,
  );
});

test("a missing section is appended and stays stable", () => {
  const section = `${LINK_HEADING}\n\ntable`;
  const once = replaceSection("== Intro ==\n\ntext\n", LINK_HEADING, section);

  assert.equal(once, "== Intro ==\n\ntext\n\n" + section + "\n");
  assert.equal(replaceSection(once, LINK_HEADING, section), once);
});
