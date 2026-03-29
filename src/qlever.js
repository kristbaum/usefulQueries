// ===== QLEVER FUNCTIONS =====

/**
 * Check if the current Wikibase is Wikidata
 * @returns {boolean} True if using Wikidata
 */
function isWikidata() {
  return SETTINGS.queryServiceUrl.includes("query.wikidata.org");
}

/**
 * Convert a Wikidata SPARQL query to QLever-compatible format
 * @param {string} query - The original SPARQL query
 * @returns {string} QLever-compatible SPARQL query
 */
function convertToQLeverQuery(query) {
  let qleverQuery = query;

  // Add necessary PREFIX declarations if not present
  const needsRdfsPrefix =
    !qleverQuery.includes("PREFIX rdfs:") && qleverQuery.includes("rdfs:label");
  const needsWdtPrefix =
    !qleverQuery.includes("PREFIX wdt:") && qleverQuery.includes("wdt:");
  const needsWdPrefix =
    !qleverQuery.includes("PREFIX wd:") && qleverQuery.includes("wd:");

  if (
    needsRdfsPrefix ||
    needsWdtPrefix ||
    needsWdPrefix ||
    qleverQuery.match(/\?(\w+Label)\b/)
  ) {
    let prefixDeclarations = "";

    if (needsRdfsPrefix || qleverQuery.match(/\?(\w+Label)\b/)) {
      prefixDeclarations +=
        "PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>\n";
    }
    if (needsWdtPrefix) {
      prefixDeclarations +=
        "PREFIX wdt: <http://www.wikidata.org/prop/direct/>\n";
    }
    if (needsWdPrefix) {
      prefixDeclarations += "PREFIX wd: <http://www.wikidata.org/entity/>\n";
    }

    const defaultViewMatch = qleverQuery.match(/^(#defaultView:[^\n]*\n)?/);
    const defaultViewPrefix = defaultViewMatch?.[1] ?? "";
    qleverQuery =
      defaultViewPrefix +
      prefixDeclarations +
      qleverQuery.substring(defaultViewPrefix.length);
  }

  // Remove the SERVICE wikibase:label block entirely
  qleverQuery = qleverQuery.replace(
    /SERVICE wikibase:label \{ bd:serviceParam wikibase:language "[^"]*"\. \}/g,
    "",
  );
  qleverQuery = qleverQuery.replace(
    /SERVICE wikibase:label \{ bd:serviceParam wikibase:language "[^"]*", ?[^}]*\. \}/g,
    "",
  );

  // Find all variables that end with "Label" and add manual label fetching
  const labelVars = query.match(/\?(\w+Label)\b/g);
  if (labelVars) {
    const uniqueLabelVars = [...new Set(labelVars)];
    let labelStatements = "";

    uniqueLabelVars.forEach((labelVar) => {
      const baseVar = labelVar.replace("Label", "").replace("?", "");
      labelStatements += `  OPTIONAL { ?${baseVar} rdfs:label ${labelVar} . FILTER(LANG(${labelVar}) = "en") }\n`;
    });

    const lastBraceIndex = qleverQuery.lastIndexOf("}");
    if (lastBraceIndex !== -1 && labelStatements) {
      qleverQuery =
        qleverQuery.slice(0, lastBraceIndex) +
        labelStatements +
        qleverQuery.slice(lastBraceIndex);
    }
  }

  qleverQuery = qleverQuery.replace(/\n\s*\n/g, "\n").trim();
  return qleverQuery;
}

/**
 * Get the QLever URL for a query
 * @param {string} querystring - The encoded query string
 * @returns {string|null} QLever URL or null if disabled
 */
function getQLeverUrl(querystring) {
  if (!SETTINGS.enableQLever || !isWikidata()) {
    return null;
  }
  const decodedQuery = decodeURIComponent(querystring.substring(1));
  const qleverQuery = convertToQLeverQuery(decodedQuery);
  return SETTINGS.qleverUrl + "?query=" + encodeURIComponent(qleverQuery);
}
