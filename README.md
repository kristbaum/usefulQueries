# UsefulQueries

Code for usefulQueries

Documentation: <https://www.wikidata.org/wiki/User:Kristbaum/usefulQueries>

## Adding your own queries

Queries that would be useful to general users can be added as suggestions [on GitHub](https://github.com/kristbaum/usefulQueries/issues) or [on Wikidata](https://www.wikidata.org/wiki/User_talk:Kristbaum/usefulQueries).

You can add your own query templates to the project by reusing the existing JSON templates in `templates/queries`.

Steps:

1. Download this repo
2. Install [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)
3. Copy one of the existing files from `templates/queries` and rename it for your new query (keep the `.json` extension).
4. Edit the file following the template structure described below.
5. Optionally add a link template in `templates/links` if your query integrates with an external viewer.
6. Rebuild the project assets so the new template becomes available in the UI:

   ```bash
   npm install
   npm run build
   ```

7. Copy `minified_version.js` and upload it to a location like: <https://www.wikidata.org/wiki/Special:MyPage/myUsefulQueries.js>
8. Replace the link in <https://www.wikidata.org/wiki/Special:MyPage/common.js> with your version.

### Query template structure (`templates/queries/*.json`)

A query template is a JSON file that describes when a button should appear and what SPARQL query it runs. There are three trigger modes controlled by `scope`:

**`scope: "entity"`** — button appears on every item:

```json
{
  "id": "entityGraph",
  "scope": "entity",
  "template": [
    "#defaultView:Graph",
    "SELECT ?node ?nodeLabel ?childNode ?childNodeLabel WHERE {",
    "  BIND(wd:{itemQid} AS ?node)",
    "  ...",
    "}"
  ],
  "emoji": "🔗",
  "toolhint": "Graph of linked entities",
  "popupTitle": "Connections of {itemLabel}",
  "enabled": true
}
```

**`scope: "property"`** — button appears when the item has a specific property (e.g. P2124 member count):

```json
{
  "id": "membersCount",
  "scope": "property",
  "propertyId": ["P2124"],
  "template": [
    "#defaultView:LineChart",
    "SELECT ?pit ?s_count WHERE {",
    "  wd:{itemQid} p:P2124 ?statement.",
    "  ?statement ps:P2124 ?s_count.",
    "  OPTIONAL { ?statement pq:P585 ?pit. }",
    "}"
  ],
  "emoji": "📊",
  "toolhint": "Members count over time",
  "popupTitle": "Members count of {itemLabel} over time:",
  "enabled": true
}
```

**`scope: "value"`** — button appears when the item has a specific property set to a specific value (e.g. occupation = painter):

```json
{
  "id": "artworks",
  "scope": "value",
  "propertyId": ["P106"],
  "valueId": ["Q1028181"],
  "template": [
    "#defaultView:ImageGrid",
    "SELECT ?item ?image WHERE {",
    "  ?item wdt:P170 wd:{itemQid}.",
    "  OPTIONAL { ?item wdt:P18 ?image. }",
    "}",
    "LIMIT 100"
  ],
  "emoji": "🖼️",
  "toolhint": "Artworks by this painter",
  "popupTitle": "Artworks by {itemLabel}",
  "enabled": true
}
```

The placeholders `{itemQid}`, `{itemLabel}`, `{valueQid}`, and `{valueLabel}` are replaced at runtime with the current item's data.

### Link template structure (`templates/links/*.json`)

A link template adds a button that opens an external URL instead of running a SPARQL query. The URL is built from a pattern using the current item's QID.

**`scope: "property"`** — link appears when the item has any of the listed properties:

```json
{
  "id": "entitree_family",
  "scope": "property",
  "propertyId": ["P22", "P25", "P26", "P40", "P3373", "P1038", "P3448", "P8810"],
  "urlTemplate": "https://www.entitree.com/en/family_tree/{itemQid}",
  "emoji": "🌳",
  "toolhint": "Family tree on Entitree",
  "enabled": true
}
```

**`scope: "value"`** — link appears when the item has a specific property set to a specific value:

```json
{
  "id": "scholia",
  "scope": "value",
  "propertyId": ["P106"],
  "valueId": ["Q1650915"],
  "urlTemplate": "https://scholia.toolforge.org/author/{itemQid}",
  "emoji": "📚",
  "toolhint": "Page on Scholia",
  "enabled": true
}
```

The `{itemQid}` placeholder is replaced at runtime with the current item's QID.

## Run on another Wikibase

Adapt the settings in [settings.json](src/settings.json) and rebuild using:

```bash
npm install
npm run build
```

### Custom builds with `--custom`

For a self-contained variant (e.g. targeting a different Wikibase), you can keep all configuration, templates and output inside a named subfolder using the `--custom <Name>` flag.

**Expected folder layout for a custom build named `MyQueries`:**

```bash
MyQueries/
├── settings.json          # Same format as src/settings.json
└── templates/
    ├── queries/           # Query template JSON files
    └── links/             # Link template JSON files
```

**Build command:**

```bash
node scripts/assemble.mjs --custom MyQueries
```

The build will read `MyQueries/settings.json`, load templates from `MyQueries/templates/queries/` and `MyQueries/templates/links/`, and write the output files into the same subfolder:

- `MyQueries/usefulMyQueriesQueries.js` — readable output
- `MyQueries/minified_MyQueries_version.js` — minified output for upload

Missing `queries/` or `links/` subdirectories are silently ignored (treated as empty). The shared source files in `src/` are always used, so only settings and templates need to be provided per variant.

## Development

```bash
sudo apt install npm
npm install # For linting tools
npm run build

# Optional
npm run lint
```

## Todo

- Make it Wikibase neutral

## Example Items

- [Artus Wolffort](https://www.wikidata.org/wiki/Q454172)
- [University of Marburg](https://www.wikidata.org/wiki/Q155354)
