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
│   ├── qlever.js             # Converts Wikidata SPARQL to QLever-compatible format
│   └── settings.json         # Runtime config: query service URLs, QLever toggle
├── templates/
│   ├── queries/              # One JSON file per query button (see template format below)
│   └── links/                # One JSON file per external link button
├── scripts/
│   ├── assemble.mjs          # Build script: assembles src + templates → output files
│   └── validate-templates.mjs # Template schema checks, run by the build
├── framework.js              # Outer IIFE wrapper injected by the build
├── usefulQueries.js          # Built readable output (do not edit directly)
├── minified_version.js       # Built minified output — the file uploaded to Wikidata
└── package.json              # npm scripts; only dev dependency is terser
```

## Build system

```bash
npm run build   # runs scripts/assemble.mjs → writes usefulQueries.js + minified_version.js
npm run lint    # ESLint check
npm test        # checks the built output files are valid, runnable JS
```

**Run tests on changes:** after editing anything in `src/` or `templates/`, run
`npm run build && npm test`. The test suite (Node's built-in runner — no extra
deps) covers two things:

- `test/build-output.test.mjs` verifies that both `usefulQueries.js` and
  `minified_version.js` exist, parse as valid JavaScript, and execute their
  top-level IIFE without throwing.
- `test/validate-templates.test.mjs` checks every shipped template against the
  schema and pins the rejection cases.

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
7. Writes `usefulQueries.js` (readable) and `minified_version.js` (terser-minified).

**Always run `npm run build` after changing any file in `src/` or `templates/`.**

## Template formats

### Query template (`templates/queries/*.json`)

Controls when a SPARQL query button appears and what it runs.

| Field | Type | Description |
| ------- | ------ | ------------- |
| `id` | string | Unique identifier |
| `scope` | `"entity"` \| `"property"` \| `"value"` | When to show the button |
| `propertyId` | string[] | Property IDs that trigger the button (required for `property`/`value`, forbidden for `entity`) |
| `valueId` | string[] \| null | Entity QIDs that the property value must match (`value` scope only; omit or `null` to match any value) |
| `template` | string[] | Lines of the SPARQL query; joined with `\n` at build time |
| `emoji` | string | Button label (usually an emoji) |
| `title` | string | Button tooltip and popup heading; supports `{itemLabel}`, `{itemQid}` placeholders |

Runtime placeholders replaced in `template` and `title`:

- `{itemQid}` — QID of the current item (e.g. `Q454172`)
- `{itemLabel}` — display label of the current item
- `{valueQid}` — QID of the matched property value (scope `value` only)
- `{valueLabel}` — label of the matched property value (scope `value` only)
- `{userLanguage}` — the user's MediaWiki language code

### Link template (`templates/links/*.json`)

Controls when an external URL button appears.

| Field | Type | Description |
| ------- | ------ | ------------- |
| `id` | string | Unique identifier |
| `scope` | `"entity"` \| `"property"` \| `"value"` | When to show the button |
| `propertyId` | string[] | Property IDs that trigger the button (required for `property`/`value`, forbidden for `entity`) |
| `valueId` | string[] \| null | Entity QIDs the value must match (`value` scope only; omit or `null` to match any value) |
| `urlTemplate` | string | Absolute `http(s)` URL pattern; supports the same placeholders as `title` |
| `emoji` | string | Button label |
| `title` | string | Button tooltip text |

### Validation

`npm run build` validates every template before assembling and fails with a list
of problems rather than silently shipping a button that never appears. The rules
are in `scripts/validate-templates.mjs`:

- Unknown fields are rejected — this is what catches typos and the field names
  from older revisions (`popupTitle`, `toolhint`, `enabled` are all gone).
- `scope` must be one of the three values; `propertyId` / `valueId` must be
  present or absent as the tables above describe, and must look like `P123` /
  `Q123`.
- `template` must be an array of strings (a bare string is a common mistake and
  would be joined character-by-character); `urlTemplate` must be absolute.
- Every `{placeholder}` must be one of the known names, and `{valueQid}` /
  `{valueLabel}` are only allowed on `value`-scope templates.

Note that `id` is documentation only — nothing reads it at runtime, and the two
`entitree` link templates deliberately share one.

## Adding a new query or link

1. Create a new `.json` file in `templates/queries/` (or `templates/links/`).
2. Follow the format above. Copy an existing file as a starting point.
3. Run `npm run build`.
4. Test locally, then upload `minified_version.js` to your Wikidata user JS page.

## Key runtime conventions

- The script only runs on namespace 0 (item pages). See `framework.js`.
- Template matching is done via pre-built lookup indexes in `processing.js` (`_templateIndex`). These are built once at script load from `USEFUL_QUERIES` and `USEFUL_LINKS`.
- On viewports narrower than 900 px the popup is replaced with a plain link button (no iframe).
- The QLever integration is toggled by `enableQLever` in `src/settings.json`. The build strips the inactive branch entirely.
- The script uses Wikimedia Codex (Vue 3 components) loaded via `mw.loader`. Do not import external libraries.

## Settings (`src/settings.json`)

```jsonc
{
  "queryServiceUrl": "https://query.wikidata.org/",       // Base URL for query links
  "queryEmbedUrl":   "https://query.wikidata.org/embed.html", // URL for iframe embeds
  "enableQLever":    true,                                 // Include QLever links in popups
  "qleverUrl":       "https://qlever.cs.uni-freiburg.de/wikidata/"
}
```

Changing `queryServiceUrl` / `queryEmbedUrl` to another Wikibase endpoint is the main way to run the script on a non-Wikidata wiki. Set `enableQLever: false` for non-Wikidata installs.
