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
4. Edit the file following [TEMPLATE_GUIDE.md](TEMPLATE_GUIDE.md) (or give that file to an LLM and let it write the template).
5. Optionally add a link template in `templates/links` if your query integrates with an external viewer.
6. Rebuild the project assets so the new template becomes available in the UI:

   ```bash
   npm install
   npm run build
   ```

7. Copy `minified_version.js` and upload it to a location like: <https://www.wikidata.org/wiki/Special:MyPage/myUsefulQueries.js>
8. Replace the link in <https://www.wikidata.org/wiki/Special:MyPage/common.js> with your version.

### Writing a template

The full reference, including fields, placeholders, where a button should hang, and how
to write SPARQL that runs (hopefully) on both WDQS and QLever, is
[TEMPLATE_GUIDE.md](TEMPLATE_GUIDE.md). It is written as a self-contained documentation, so everything for writing your own queries templates should be in there.

In short, each button is one JSON file with a `scope`:

- **`entity`**: next to the item title, on every item.
- **`property`**: next to a property label; for queries that use *all* of that
  property's values together, or none of them (the property just signals the
  right kind of item).
- **`value`**: next to each statement value; for queries whose answer depends
  on the clicked value (`{valueQid}`), or, with `valueId`, for buttons that
  should only appear when a value matches (e.g. occupation = painter).

## Run on another Wikibase

Adapt the settings in [settings.json](src/settings.json) and rebuild using:

```bash
npm install
npm run build
```

> **Wikibase Cloud / MediaWiki version compatibility:**
> The popup feature relies on `CdxPopover` from the [Codex](https://doc.wikimedia.org/codex/) design system, which is not available on every Wikibase Version. The script detects this at runtime and automatically falls back to opening the query as a plain link in a new tab instead of showing an inline popup.

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

**Variants in this repository:**

- [`ReSaNode/`](ReSaNode/) — targets the ReSaNode Wikibase Cloud instance.
- [`Deckenmalerei/`](Deckenmalerei/README.md) — targets Wikidata, with queries for
  the Baroque ceiling painting corpus (`deckenmalerei.eu ID`, P10626).

## Development

```bash
sudo apt install npm
npm install # For linting tools
npm run build

# Optional
npm run lint
```

## Todo

- Make it Wikibase agnostic

## Example Items

- [Artus Wolffort](https://www.wikidata.org/wiki/Q454172)
- [University of Marburg](https://www.wikidata.org/wiki/Q155354)
