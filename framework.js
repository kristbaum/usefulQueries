/*
 * usefulQueries: adds buttons to Wikibase item pages that run SPARQL queries
 * or open external tools relevant to the item's statements.
 *
 * Documentation: https://www.wikidata.org/wiki/User:Kristbaum/usefulQueries
 *
 * License of this file: CC0
 */

$(function () {
  "use strict";

  /* __SETTINGS__ */

  // The settings page, Special:BlankPage/<configName>.
  const ON_SETTINGS_PAGE =
    mw.config.get("wgCanonicalSpecialPageName") === "Blankpage" &&
    String(mw.config.get("wgPageName")).split("/").slice(1).join("/") === SETTINGS.configName;

  // The user's own config page, User:<name>/<configName>.json.
  const ON_CONFIG_PAGE =
    mw.config.get("wgNamespaceNumber") === 2 &&
    String(mw.config.get("wgTitle")) ===
      String(mw.config.get("wgUserName")) + "/" + SETTINGS.configName + ".json";

  // Otherwise only run on items (the main namespace on Wikidata).
  if (
    !ON_SETTINGS_PAGE &&
    !ON_CONFIG_PAGE &&
    mw.config.get("wgNamespaceNumber") !== SETTINGS.allowedNamespace
  ) {
    return;
  }

  // Built-in templates, inlined from templates/queries/*.json and
  // templates/links/*.json by the build. Field reference: TEMPLATE_GUIDE.md.
  // (The build joins each query's SPARQL lines into one string.)
  const USEFUL_QUERIES = [
    /* __USEFUL_QUERIES__ */
  ];

  const USEFUL_LINKS = [
    /* __USEFUL_LINKS__ */
  ];

  /* __SOURCES__ */
});
