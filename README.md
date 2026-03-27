# UsefulQueries

Code for usefulQueries

Documentation: <https://www.wikidata.org/wiki/User:Kristbaum/usefulQueries>

## Adding your own queries

Queries that would be usful to general users, can be added as suggestions here ([Github](https://github.com/kristbaum/usefulQueries/issues)) or here ([Wikidata](https://www.wikidata.org/wiki/User_talk:Kristbaum/usefulQueries)).

You can add your own query templates to the project by reusing the existing JSON templates in `templates/queries`, if you don't think they would be useful to other people.

Steps:

1. Download this repo
2. Install [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) (I'm sorry.. It just was easier to modularize this way)
3. Copy one of the existing files from `templates/queries` and rename it for your new query (keep the `.json` extension).
4. Edit the file to include your query title, description and the SPARQL query text or parameters following the structure used by the other templates.
5. Optionally add or update link templates in `templates/links` if your query integrates with external viewers (Entitree/Scholia).
6. Rebuild the project assets so the new template becomes available in the UI:

   ```bash
   npm install
   npm run build
   ```

7. Copy the minified_version.js and upload it a location like: <https://www.wikidata.org/wiki/Special:MyPage/myUsefuelQueries.js>
8. Replace the link in <https://www.wikidata.org/wiki/Special:MyPage/common.js> with your version.

## Run on another Wikibase

Adapt the settings in [settings.json](src/settings.json) and rebuild using:

```bash
npm install
npm run build
```

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
