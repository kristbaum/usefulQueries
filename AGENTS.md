# AGENTS.md — usefulQueries codebase guide

This file helps AI agents understand the project structure, build system, and conventions before making changes.

## What the project does

**usefulQueries** is a MediaWiki user script that enhances Wikidata (and other Wikibase) item pages by automatically adding context-sensitive buttons. Each button either opens a SPARQL query result in a popup (query buttons) or links to an external visualization tool (link buttons). The script inspects the item's claims at runtime and only shows buttons that are relevant to that specific item.

## Repository layout

```bash
usefulQueries/
├── src/                      # Source JavaScript modules (not executable directly)
│   ├── main.js               # Entry point: hooks into wikibase.entityPage.entityLoaded
│   ├── processing.js         # Matches templates against item claims; dispatches to UI
│   ├── ui.js                 # Vue/Codex components: popup and link buttons
│   ├── dom.js                # DOM helpers: locates property/statement/indicator elements
│   ├── helpers.js            # Pure utilities: replacePlaceholders(), encodeQueryString()
│   ├── qlever.js             # Builds "To QLever" links (conversion happens in that tool)
│   └── settings.json         # Runtime config: query service URLs, QLever toggle
├── templates/
│   ├── queries/              # One JSON file per query button (see template format below)
│   └── links/                # One JSON file per external link button
├── scripts/
│   ├── assemble.mjs          # Build script: assembles src + templates → output files
│   ├── generate-wiki.mjs     # Regenerates the query/link overviews in usefulQueries.wiki
│   ├── validate-templates.mjs # Template schema checks, run by the build
│   └── check-sparql.mjs      # WDQS/QLever portability checks, run by the build
├── framework.js              # Outer IIFE wrapper injected by the build
├── TEMPLATE_GUIDE.md         # How to write templates — self-contained, for LLM agents and users
├── usefulQueries.wiki        # On-wiki documentation; its overview sections are generated
├── usefulQueries.js          # Built readable output (do not edit directly)
├── minified_usefulQueries.js # Built minified output — the file uploaded to Wikidata
└── package.json              # npm scripts; dev dependencies are terser + oxlint
```

## Build system

```bash
npm run build   # runs scripts/assemble.mjs → writes usefulQueries.js + minified_usefulQueries.js
npm run lint    # oxlint check (readable build output)
npm test        # checks the built output files are valid, runnable JS
```

**Run tests on changes:** after editing anything in `src/` or `templates/`, run
`npm run build && npm test`. The test suite (Node's built-in runner — no extra
deps) covers two things:

- `test/build-output.test.mjs` verifies that both `usefulQueries.js` and
  `minified_usefulQueries.js` exist, parse as valid JavaScript, and execute their
  top-level IIFE without throwing.
- `test/validate-templates.test.mjs` checks every shipped template against the
  schema and pins the rejection cases.
- `test/wiki-overview.test.mjs` fails if the generated overviews in
  `usefulQueries.wiki` are stale (i.e. templates changed without a rebuild).
- `test/check-sparql.test.mjs` pins the WDQS/QLever portability rules described
  below, and asserts that every shipped query template still satisfies them.

Keep them green before committing.

`assemble.mjs` does the following in order:

1. Reads `framework.js` (the outer `$(function(){ "use strict"; … })` wrapper).
2. Injects `src/settings.json` as a `const SETTINGS = …` literal.
3. Injects all `templates/queries/*.json` files as a `const USEFUL_QUERIES = […]` literal.
4. Injects all `templates/links/*.json` files as a `const USEFUL_LINKS = […]` literal.

   Steps 3 and 4 validate each file first (`scripts/validate-templates.mjs`) and
   abort the build, listing every problem found, if any template is malformed.
5. Concatenates the `src/` files in this fixed order: `helpers.js`, `qlever.js`, `ui.js`, `dom.js`, `processing.js`, `main.js`.
6. Strips conditional QLever blocks (`/* __IF_QLEVER__ */` … `/* __ENDIF_QLEVER__ */`) based on `enableQLever` in settings.
7. Writes `usefulQueries.js` (readable) and `minified_usefulQueries.js` (terser-minified).
   A profile built with `--profile <Name>` writes `<Name>/<Name>_usefulQueries.js`
   and `<Name>/minified_<Name>_usefulQueries.js` instead — same names, prefixed.
8. Regenerates the `== Query overview ==` and `== Link overview ==` sections of
   `usefulQueries.wiki` from the templates (`scripts/generate-wiki.mjs`).
   Everything from a managed heading up to the next top-level heading is
   replaced, so the rest of the page is safe to edit by hand; a missing heading
   is appended. Profiles without a matching `.wiki` file skip this step.

**Always run `npm run build` after changing any file in `src/` or `templates/`.**

## Writing templates

Everything about *designing* a template — the field reference, placeholders,
how to choose `scope`, and the rules for SPARQL that runs on both WDQS and
QLever — lives in [TEMPLATE_GUIDE.md](TEMPLATE_GUIDE.md). It is written to be
handed to an LLM on its own, so script users can create buttons without reading
this file. Read it before adding or changing anything in `templates/` or a
profile's `templates/`.

The build enforces the schema (`scripts/validate-templates.mjs`) and three
syntactic SPARQL rules (`scripts/check-sparql.mjs`). It cannot check that the
scope is right: a template whose result depends on the clicked value must be
`scope: "value"` and use `{valueQid}`, not read the property back out of
`{itemQid}`.

## Key runtime conventions

- The script only runs on namespace 0 (item pages). See `framework.js`.
- Template matching is done via pre-built lookup indexes in `processing.js` (`_templateIndex`). These are built once at script load from `USEFUL_QUERIES` and `USEFUL_LINKS`.
- On viewports narrower than 900 px the popup is replaced with a plain link button (no iframe).
- The QLever integration is toggled by `enableQLever` in `src/settings.json`. The build strips the inactive branch entirely. The popup's QLever action just hands the WDQS URL to the [To QLever](https://to-qlever.toolforge.org/) Toolforge tool, which converts the query server-side and redirects to QLever — the script does no SPARQL rewriting itself.
- The script uses Wikimedia Codex (Vue 3 components) loaded via `mw.loader`. Do not import external libraries.

## Settings (`src/settings.json`)

```jsonc
{
  "queryServiceUrl": "https://query.wikidata.org/",       // Base URL for query links
  "queryEmbedUrl":   "https://query.wikidata.org/embed.html", // URL for iframe embeds
  "enableQLever":    true,                                 // Include QLever links in popups
  "toQLeverUrl":     "https://to-qlever.toolforge.org/to-qlever"
}
```

Changing `queryServiceUrl` / `queryEmbedUrl` to another Wikibase endpoint is the main way to run the script on a non-Wikidata wiki. Set `enableQLever: false` for non-Wikidata installs.
