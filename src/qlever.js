// ===== QLEVER FUNCTIONS =====

/**
 * Check if the current Wikibase is Wikidata
 * @returns {boolean} True if using Wikidata
 */
function isWikidata() {
  return SETTINGS.queryServiceUrl.includes("query.wikidata.org");
}

/**
 * Build a "To QLever" link for a query. The Toolforge tool
 * (https://to-qlever.toolforge.org/) parses the WDQS query, rewrites the
 * Blazegraph-specific parts (label service, named subqueries, query hints,
 * missing prefixes) and redirects to QLever with the converted query.
 * @param {string} querystring - The encoded query string (starts with "#")
 * @returns {string|null} To QLever URL or null if disabled
 */
function getQLeverUrl(querystring) {
  if (!SETTINGS.enableQLever || !isWikidata()) {
    return null;
  }
  const queryServiceHref = SETTINGS.queryServiceUrl + querystring;
  return SETTINGS.toQLeverUrl + "?url=" + encodeURIComponent(queryServiceHref);
}
