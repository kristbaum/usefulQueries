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
│   ├── config.js             # Loads/saves the user's config page (User:<name>/<configName>.json)
│   ├── editor.js             # Edit mode on item pages + the add/edit-button dialog
│   ├── settings-page.js      # Special:BlankPage/<configName>: toggles, own buttons, import
│   ├── shared/
│   │   └── user-config.mjs   # Pure config logic (parse, validate, merge, generalize queries); tested directly
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
deps) covers:

- `test/validate-templates.test.mjs` checks every shipped template against the
  schema and pins the rejection cases.
- `test/wiki-overview.test.mjs` fails if the generated overviews in
  `usefulQueries.wiki` are stale (i.e. templates changed without a rebuild).
- `test/check-sparql.test.mjs` pins the WDQS/QLever portability rules described
  below, and asserts that every shipped query template still satisfies them.
- `test/user-config.test.mjs` covers parsing, validating and merging user configs.
- `test/runtime-smoke.test.mjs` runs both built files (`usefulQueries.js` and
  `minified_usefulQueries.js`) against stubbed `mw`/`$`: as an item page (logged
  out, logged in, broken config), as the settings page, and on pages it must
  ignore.

Keep them green before committing.

`assemble.mjs` does the following in order:

1. Reads `framework.js` (the outer `$(function(){ "use strict"; … })` wrapper).
2. Injects `src/settings.json` as a `const SETTINGS = …` literal.
3. Injects all `templates/queries/*.json` files as a `const USEFUL_QUERIES = […]` literal.
4. Injects all `templates/links/*.json` files as a `const USEFUL_LINKS = […]` literal.

   Steps 3 and 4 validate each file first (`scripts/validate-templates.mjs`) and
   abort the build, listing every problem found, if any template is malformed.
5. Inlines the shared ES modules (`scripts/check-sparql.mjs`,
   `scripts/validate-templates.mjs`, `src/shared/user-config.mjs`) with their
   `import`/`export` keywords stripped, so the runtime validates user configs
   with the same code the build uses. Keep their top-level names distinct from
   the `src/` files, since they all share one scope.
   Then concatenates everything at the framework's single `/* __SOURCES__ */`
   marker, in the order of `SRC_FILES` in `assemble.mjs`: `helpers.js`, the shared
   modules, `qlever.js`, `ui.js`, `dom.js`, `processing.js`, `config.js`,
   `editor.js`, `settings-page.js`, `main.js`. A new source file only needs an
   entry there.
6. Writes `usefulQueries.js` (readable) and `minified_usefulQueries.js` (terser-minified;
   the whitespace inside inline Vue `template:` strings is collapsed first).
   A profile built with `--profile <Name>` writes `<Name>/<Name>_usefulQueries.js`
   and `<Name>/minified_<Name>_usefulQueries.js` instead — same names, prefixed.
7. Regenerates the `== Query overview ==` and `== Link overview ==` sections of
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
scope is right: a template whose result depends on the statement's value (its object) must be
`scope: "value"` and use `wd:{valueId}` / `{valueSparql}`, not read the property
back out of `{itemId}`. Placeholder naming: `…Id` is a bare entity ID, `{valueSparql}`
a ready SPARQL term; the old names (`{itemQid}`, `{valueQid}`, …) are rejected.

## Key runtime conventions

- The script runs on item pages (`allowedNamespace`), on its settings page
  `Special:BlankPage/<configName>` and on the user's own config page. See `framework.js`.
- **Per-user config:** logged-in users' choices live on `User:<name>/<configName>.json`
  (`configName` defaults to the build's base name, e.g. `usefulQueries`). It holds
  `disabled` (built-in ids to hide), `seen`, and `queries`/`links` in the same JSON
  form as template files. Built-in ids must therefore be unique and stable —
  renaming one un-hides it for everyone who hid it. A broken config page never
  breaks the script: invalid entries are skipped with a notice.
- The config is loaded before the first render; `applyUserConfig()` rebuilds the
  template index and `renderButtons()` redraws everything (also used by edit mode).
- Template matching is done via pre-built lookup indexes in `processing.js` (`_templateIndex`), keyed `<scope>:<section>:<propertyId>`. They are rebuilt by `setActiveTemplates()` when the user's config loads.
- `section` (`statement` | `qualifiers` | `references`) places property/value buttons on qualifiers or reference snaks. These are located by snak hash (`.wikibase-snakview-<hash>` on desktop, `[data-snak-hash]` on mobile); mobile references are not rendered at load and get no buttons.
- On viewports narrower than 900 px the popup is replaced with a plain link button (no iframe).
- The QLever integration is toggled by `enableQLever` in `src/settings.json`. The build forces it off for any query service other than Wikidata's, and `getQLeverUrl()` returns null when it is off. The popup's QLever action just hands the WDQS URL to the [To QLever](https://to-qlever.toolforge.org/) Toolforge tool, which converts the query server-side and redirects to QLever — the script does no SPARQL rewriting itself.
- The script uses Wikimedia Codex (Vue 3 components) loaded via `mw.loader`. Do not import external libraries.

## Settings (`src/settings.json`)

```jsonc
{
  "queryServiceUrl": "https://query.wikidata.org/",       // Base URL for query links
  "queryEmbedUrl":   "https://query.wikidata.org/embed.html", // URL for iframe embeds
  "enableQLever":    true,                                 // Include QLever links in popups
  "toQLeverUrl":     "https://to-qlever.toolforge.org/to-qlever",
  "allowedNamespace": 0,                                   // Namespace of item pages (120 on many Wikibase Cloud wikis)
  // Optional, filled in by the build when absent:
  // "configName":    "usefulQueries",                     // User:<name>/<configName>.json
  // "displayName":   "usefulQueries",                     // Label in the Tools menu
  // "repositoryUrl": "https://github.com/kristbaum/usefulQueries",
  // "helpUrl":       "…/User:Kristbaum/usefulQueries#Your_own_buttons", // Linked from the settings page
  // "sparqlEndpoint": "<queryServiceUrl>sparql"           // Used by the editor's preview
}
```

Changing `queryServiceUrl` / `queryEmbedUrl` to another Wikibase endpoint is the main way to run the script on a non-Wikidata wiki. Set `enableQLever: false` for non-Wikidata installs.
