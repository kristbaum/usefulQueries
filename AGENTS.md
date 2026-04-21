# AGENTS.md — usefulQueries codebase guide

This file helps AI agents understand the project structure, build system, and conventions before making changes.

## What the project does

**usefulQueries** is a MediaWiki user script that enhances Wikidata (and other Wikibase) item pages by automatically adding context-sensitive buttons. Each button either opens a SPARQL query result in a popup (query buttons) or links to an external visualization tool (link buttons). The script inspects the item's claims at runtime and only shows buttons that are relevant to that specific item.

## Repository layout

```
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
│   └── assemble.mjs          # Build script: assembles src + templates → output files
├── framework.js              # Outer IIFE wrapper injected by the build
├── usefulQueries.js          # Built readable output (do not edit directly)
├── minified_version.js       # Built minified output — the file uploaded to Wikidata
└── package.json              # npm scripts; only dev dependency is terser
```

## Build system

```bash
npm run build   # runs scripts/assemble.mjs → writes usefulQueries.js + minified_version.js
npm run lint    # ESLint check
```

`assemble.mjs` does the following in order:
1. Reads `framework.js` (the outer `$(function(){ "use strict"; … })` wrapper).
2. Injects `src/settings.json` as a `const SETTINGS = …` literal.
3. Injects all `templates/queries/*.json` files as a `const USEFUL_QUERIES = […]` literal.
4. Injects all `templates/links/*.json` files as a `const USEFUL_LINKS = […]` literal.
5. Concatenates the `src/` files in this fixed order: `helpers.js`, `qlever.js`, `ui.js`, `dom.js`, `processing.js`, `main.js`.
6. Strips conditional QLever blocks (`/* __IF_QLEVER__ */` … `/* __ENDIF_QLEVER__ */`) based on `enableQLever` in settings.
7. Writes `usefulQueries.js` (readable) and `minified_version.js` (terser-minified).

**Always run `npm run build` after changing any file in `src/` or `templates/`.**

## Template formats

### Query template (`templates/queries/*.json`)

Controls when a SPARQL query button appears and what it runs.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `scope` | `"entity"` \| `"property"` \| `"value"` | When to show the button |
| `propertyId` | string[] | Property IDs that trigger the button (required for `property`/`value`) |
| `valueId` | string[] \| null | Entity QIDs that the property value must match (required for `value`) |
| `template` | string[] | Lines of the SPARQL query; joined with `\n` at build time |
| `emoji` | string | Button label (usually an emoji) |
| `toolhint` | string | Tooltip text |
| `popupTitle` | string | Popup heading; supports `{itemLabel}`, `{itemQid}` placeholders |
| `enabled` | boolean | Set `false` to disable without deleting the file |

Runtime placeholders replaced in `template` and `popupTitle`:
- `{itemQid}` — QID of the current item (e.g. `Q454172`)
- `{itemLabel}` — display label of the current item
- `{valueQid}` — QID of the matched property value (scope `value` only)
- `{valueLabel}` — label of the matched property value (scope `value` only)
- `{userLanguage}` — the user's MediaWiki language code

### Link template (`templates/links/*.json`)

Controls when an external URL button appears.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `scope` | `"property"` \| `"value"` | When to show the button |
| `propertyId` | string[] | Property IDs that trigger the button |
| `valueId` | string[] | Entity QIDs the value must match (`value` scope only) |
| `urlTemplate` | string | URL pattern; supports `{itemQid}` placeholder |
| `emoji` | string | Button label |
| `toolhint` | string | Tooltip text |
| `enabled` | boolean | Set `false` to disable |

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
