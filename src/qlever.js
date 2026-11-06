// ===== QLEVER =====

/**
 * Build a "To QLever" link for a query. The Toolforge tool
 * (https://to-qlever.toolforge.org/) parses the WDQS query, rewrites the
 * Blazegraph-specific parts (label service, named subqueries, query hints,
 * missing prefixes) and redirects to QLever with the converted query.
 * The build turns enableQLever off for every wiki but Wikidata.
 * @param {string} querystring - The encoded query string (starts with "#")
 * @returns {string|null} To QLever URL, or null if disabled
 */
function getQLeverUrl(querystring) {
  if (!SETTINGS.enableQLever) return null;
  const queryServiceHref = SETTINGS.queryServiceUrl + querystring;
  return SETTINGS.toQLeverUrl + "?url=" + encodeURIComponent(queryServiceHref);
}
