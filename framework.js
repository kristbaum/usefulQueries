/*
 * This script provides context-based queries to statements for Wikibase pages.
 * It creates a popup when you click on certain elements, showing live queries It also provides some some links to projects like entitree and scholia.
 *
 * To activate this script, add the line below to your common.js on MediaWiki (go to https://www.wikidata.org/wiki/Special:MyPage/common.js):
 * mw.loader.load("//www.wikidata.org/w/index.php?title=User:Kristbaum/usefulQueries.js&action=raw&ctype=text/javascript");
 * The source code in readable form can be found here https://github.com/kristbaum/usefulQueries/
 *
 * License: CC0
 */

$(function () {
  "use strict";

  /* __SETTINGS__ */

  // Exit the script if we're not in the main namespace (article namespace).
  if (mw.config.get("wgNamespaceNumber") !== SETTINGS.allowedNamespace) {
    return;
  }

  // ===== CONFIGURATION =====

  /**
   * @typedef {Object} UsefulQuery
   * @property {string} id - Unique identifier for the query
   * @property {"entity"|"property"|"value"} scope - Where to attach the query button
   *   - "entity": Attaches to the entity title (entity-wide query)
   *   - "property": Attaches to a property label
   *   - "value": Attaches to a specific property+value combination
   * @property {string} [propertyId] - Property ID to match (required for "property" and "value" scope)
   * @property {string} [valueId] - Value entity ID to match (required for "value" scope)
   * @property {string} template - SPARQL query template with placeholders
   * @property {string} emoji - Emoji/text label for the button
   * @property {string} toolhint - Tooltip text
   * @property {string} popupTitle - Title for the popup (supports {itemLabel} placeholder)
   * @property {boolean} [enabled=true] - Whether this query is enabled
   */

  /**
   * @typedef {Object} UsefulLink
   * @property {string} id - Unique identifier for the link
   * @property {"entity"|"property"|"value"} scope - Where to attach the link button
   * @property {string|string[]} [propertyId] - Property ID(s) to match (for "property" scope, can be array)
   * @property {string} [valueId] - Value entity ID to match (required for "value" scope)
   * @property {string} urlTemplate - URL template with placeholders ({itemQid}, {valueQid})
   * @property {string} emoji - Emoji/text label for the button
   * @property {string} toolhint - Tooltip text
   * @property {boolean} [enabled=true] - Whether this link is enabled
   */

  // ===== USEFUL QUERIES CONFIGURATION =====
  // Add new queries here - they will automatically be attached to the right places

  /** @type {UsefulQuery[]} */
  const USEFUL_QUERIES = [
    /* __USEFUL_QUERIES__ */
  ];

  // ===== USEFUL LINKS CONFIGURATION =====
  // Add new external links here - they will automatically be attached to the right places

  /** @type {UsefulLink[]} */
  const USEFUL_LINKS = [
    /* __USEFUL_LINKS__ */
  ];

  /* __HELPERS__ */

  /* __QLEVER__ */

  /* __UI__ */

  /* __DOM__ */

  /* __PROCESSING__ */

  /* __MAIN__ */
});
