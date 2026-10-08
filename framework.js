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
   * @property {string[]} [propertyId] - Property IDs to match (required for "property" and "value" scope)
   * @property {string[]|null} [valueId] - Value entity IDs to match ("value" scope; null matches any value)
   * @property {string} template - SPARQL query template with placeholders
   * @property {string} emoji - Emoji/text label for the button
   * @property {string} title - Button tooltip and popup heading (supports {itemLabel}, {itemQid} placeholders)
   */

  /**
   * @typedef {Object} UsefulLink
   * @property {string} id - Unique identifier for the link
   * @property {"entity"|"property"|"value"} scope - Where to attach the link button
   * @property {string[]} [propertyId] - Property IDs to match (required for "property" and "value" scope)
   * @property {string[]|null} [valueId] - Value entity IDs to match ("value" scope; null matches any value)
   * @property {string} urlTemplate - URL template with placeholders ({itemQid}, {valueQid})
   * @property {string} emoji - Emoji/text label for the button
   * @property {string} title - Button tooltip text
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
