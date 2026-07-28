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

  // ===== GLOBAL SETTINGS =====
  const SETTINGS = {
    queryServiceUrl: "https://query.wikidata.org/",
    queryEmbedUrl: "https://query.wikidata.org/embed.html",
    enableQLever: true,
    toQLeverUrl: "https://to-qlever.toolforge.org/to-qlever",
    allowedNamespace: 0,
  };

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
    {
      id: "architectWorksMap",
      scope: "value",
      propertyId: ["P84"],
      valueId: null,
      template: `#defaultView:Map
SELECT DISTINCT ?building ?buildingLabel ?coordinates ?inception ?image WHERE {
  ?building wdt:P84 wd:{valueQid};
    wdt:P625 ?coordinates.
  OPTIONAL { ?building wdt:P571 ?inception. }
  OPTIONAL { ?building wdt:P18 ?image. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],mul,en". }
}
LIMIT 1000`,
      emoji: "🏛️",
      title: "Map of buildings designed by {valueLabel}",
    },
    {
      id: "architectWorksMapOccupation",
      scope: "value",
      propertyId: ["P106"],
      valueId: ["Q42973"],
      template: `#defaultView:Map
SELECT DISTINCT ?building ?buildingLabel ?coordinates ?inception ?image WHERE {
  ?building wdt:P84 wd:{itemQid};
    wdt:P625 ?coordinates.
  OPTIONAL { ?building wdt:P571 ?inception. }
  OPTIONAL { ?building wdt:P18 ?image. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],mul,en". }
}
LIMIT 1000`,
      emoji: "🏛️",
      title: "Map of buildings designed by {itemLabel}",
    },
    {
      id: "architectWorksTimeline",
      scope: "value",
      propertyId: ["P84"],
      valueId: null,
      template: `#defaultView:Timeline
SELECT DISTINCT ?building ?buildingLabel ?date ?image WHERE {
  ?building wdt:P84 wd:{valueQid}.
  # Inception, falling back to the date the building opened.
  OPTIONAL { ?building wdt:P571 ?inception. }
  OPTIONAL { ?building wdt:P1619 ?opening. }
  BIND(COALESCE(?inception, ?opening) AS ?date)
  FILTER(BOUND(?date))
  OPTIONAL { ?building wdt:P18 ?image. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],mul,en". }
}
ORDER BY ?date
LIMIT 1000`,
      emoji: "📅",
      title: "Timeline of buildings designed by {valueLabel}",
    },
    {
      id: "architectWorksTimelineOccupation",
      scope: "value",
      propertyId: ["P106"],
      valueId: ["Q42973"],
      template: `#defaultView:Timeline
SELECT DISTINCT ?building ?buildingLabel ?date ?image WHERE {
  ?building wdt:P84 wd:{itemQid}.
  # Inception, falling back to the date the building opened.
  OPTIONAL { ?building wdt:P571 ?inception. }
  OPTIONAL { ?building wdt:P1619 ?opening. }
  BIND(COALESCE(?inception, ?opening) AS ?date)
  FILTER(BOUND(?date))
  OPTIONAL { ?building wdt:P18 ?image. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],mul,en". }
}
ORDER BY ?date
LIMIT 1000`,
      emoji: "📅",
      title: "Timeline of buildings designed by {itemLabel}",
    },
    {
      id: "artistTimeline",
      scope: "value",
      propertyId: ["P106"],
      valueId: ["Q1028181"],
      template: `#defaultView:Timeline
SELECT DISTINCT ?item ?itemLabel ?date ?year ?edgeLabel ?image WHERE {
  {
    # Required, not OPTIONAL: the FILTER(BOUND(?date)) this replaces
    # discarded every artwork without an inception date anyway.
    ?item wdt:P170 wd:{itemQid};
      wdt:P571 ?date.
    BIND("Artwork" AS ?edgeLabel)
  }
  UNION
  {
    BIND(wd:{itemQid} AS ?item)
    wd:{itemQid} wdt:P569 ?date.
    BIND("Birth" AS ?edgeLabel)
  }
  UNION
  {
    BIND(wd:{itemQid} AS ?item)
    wd:{itemQid} wdt:P570 ?date.
    BIND("Death" AS ?edgeLabel)
  }
  # One lookup below the UNION covers every arm, so the birth and death
  # rows now carry the artist's own image too.
  OPTIONAL { ?item wdt:P18 ?image. }
  BIND(STR(YEAR(?date)) AS ?year)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],mul,en". }
}`,
      emoji: "📅",
      title: "Artistic timeline of {itemLabel}",
    },
    {
      id: "artworkLocationsMap",
      scope: "value",
      propertyId: ["P106"],
      valueId: ["Q1028181"],
      template: `#defaultView:Map
SELECT DISTINCT ?work ?workLabel ?location ?locationLabel ?coordinates ?imageOfLocation ?image WHERE {
  ?work wdt:P170 wd:{itemQid};
    wdt:P276 ?location.
  ?location wdt:P625 ?coordinates.
  OPTIONAL {?location wdt:P18 ?imageOfLocation.}
  OPTIONAL {?work wdt:P18 ?image.}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],mul,de,en". }
}
LIMIT 100`,
      emoji: "📍",
      title: "Artwork locations of {itemLabel}",
    },
    {
      id: "artworks",
      scope: "value",
      propertyId: ["P106"],
      valueId: ["Q1028181"],
      template: `#defaultView:ImageGrid
SELECT ?item ?creator ?creatorLabel ?image WHERE {
  ?item wdt:P170 wd:{itemQid}.
  OPTIONAL { ?item wdt:P18 ?image. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". }
}
LIMIT 100`,
      emoji: "🖼️",
      title: "Artworks by {itemLabel} on Commons",
    },
    {
      id: "authorWorks",
      scope: "value",
      propertyId: ["P106"],
      valueId: ["Q18844224","Q36180","Q6625963"],
      template: `#defaultView:Table
SELECT ?work ?workLabel ?publication_date ?image WHERE {
  ?work wdt:P50 wd:{itemQid}.
  ?work wdt:P31 wd:Q7725634.
  OPTIONAL { ?work wdt:P577 ?publication_date. }
  OPTIONAL { ?work wdt:P18 ?image. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],mul,en". }
}
LIMIT 10000`,
      emoji: "📖",
      title: "Literary works by {itemLabel}",
    },
    {
      id: "awardWinnersTimeline",
      scope: "value",
      propertyId: ["P166"],
      valueId: null,
      template: `#defaultView:Timeline
SELECT DISTINCT ?laureate ?laureateLabel ?date ?image WHERE {
  # The date of the award lives on the statement, not on the laureate.
  ?laureate p:P166 ?statement.
  ?statement ps:P166 wd:{valueQid};
    pq:P585 ?date.
  OPTIONAL { ?laureate wdt:P18 ?image. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],mul,en". }
}
ORDER BY ?date
LIMIT 1000`,
      emoji: "🏅",
      title: "Everyone who received {valueLabel}, over time",
    },
    {
      id: "biologistTaxons",
      scope: "value",
      propertyId: ["P106"],
      valueId: ["Q2487799","Q2374149"],
      template: `#defaultView:Graph
SELECT DISTINCT ?node ?nodeLabel ?nodeImage ?childNode ?childNodeLabel ?childNodeImage WHERE {
  BIND(wd:{itemQid} AS ?node)
  ?childNode p:P225 ?statement.
  ?statement pq:P405 ?node.
  OPTIONAL { ?node wdt:P18 ?nodeImage. }
  OPTIONAL { ?childNode wdt:P18 ?childNodeImage. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en,mul". }
}
LIMIT 500`,
      emoji: "🍄",
      title: "All taxons (co-)described by {itemLabel}",
    },
    {
      id: "birthPlacePeople",
      scope: "value",
      propertyId: ["P19"],
      valueId: null,
      template: `#defaultView:ImageGrid
SELECT ?person ?personLabel ?image ?sitelinks WHERE {
  ?person wdt:P19 wd:{valueQid};
    wdt:P18 ?image;
    wikibase:sitelinks ?sitelinks.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],mul,en". }
}
ORDER BY DESC(?sitelinks)
LIMIT 100`,
      emoji: "👶",
      title: "Best-known people born in {valueLabel}",
    },
    {
      id: "collectionHighlightsMap",
      scope: "value",
      propertyId: ["P195"],
      valueId: null,
      template: `#defaultView:ImageGrid
SELECT ?work ?workLabel ?creatorLabel ?inception ?image WHERE {
  ?work wdt:P195 wd:{valueQid};
    wdt:P18 ?image.
  OPTIONAL { ?work wdt:P170 ?creator. }
  OPTIONAL { ?work wdt:P571 ?inception. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],mul,en". }
}
LIMIT 100`,
      emoji: "🏺",
      title: "Illustrated works in the collection of {valueLabel}",
    },
    {
      id: "countsOverTime",
      scope: "property",
      propertyId: ["P1082","P2124","P2196"],
      template: `#defaultView:LineChart
SELECT ?pit ?count ?series WHERE {
  {
    VALUES (?prop ?value ?series) {
      (p:P1082 ps:P1082 "Population")
      (p:P2124 ps:P2124 "Members")
      (p:P2196 ps:P2196 "Students")
    }
    wd:{itemQid} ?prop ?statement.
    ?statement ?value ?count.
  }
  UNION
  {
    # Male and female population are qualifiers on the population statement.
    VALUES (?qualifier ?series) {
      (pq:P1540 "Male population")
      (pq:P1539 "Female population")
    }
    wd:{itemQid} p:P1082 ?statement.
    ?statement ?qualifier ?count.
  }
  OPTIONAL { ?statement pq:P585 ?pit. }
}
ORDER BY ?series ?pit`,
      emoji: "📊",
      title: "Population, members and students of {itemLabel} over time",
    },
    {
      id: "deckenmalareiArtworkMap",
      scope: "property",
      propertyId: ["P10626"],
      template: `#defaultView:Map
SELECT DISTINCT ?work ?workLabel ?location ?locationLabel ?coordinates ?imageOfLocation ?image ?workDeckenmalareiId ?workDeckenmalareiUrl ?locationDeckenmalareiId ?locationDeckenmalareiUrl WHERE {
  
  # Works related to the entity with deckenmalerei.eu ID
  {
    wd:{itemQid} wdt:P170 ?work.  # works by this creator
    ?work wdt:P276 ?location.
  }
  UNION
  {
    ?work wdt:P170 wd:{itemQid}.  # alternative: works created by this entity
    ?work wdt:P276 ?location.
  }
  UNION
  {
    wd:{itemQid} wdt:P276 ?work.  # if the entity itself is located somewhere, show related works
    ?work wdt:P276 ?location.
  }
  
  ?location wdt:P625 ?coordinates.
  OPTIONAL {?location wdt:P18 ?imageOfLocation.}
  OPTIONAL {?work wdt:P18 ?image.}
  OPTIONAL {
    ?work wdt:P10626 ?workDeckenmalareiId.
    BIND(IRI(CONCAT("https://www.deckenmalerei.eu/", ?workDeckenmalareiId)) AS ?workDeckenmalareiUrl)
  }
  OPTIONAL {
    ?location wdt:P10626 ?locationDeckenmalareiId.
    BIND(IRI(CONCAT("https://www.deckenmalerei.eu/", ?locationDeckenmalareiId)) AS ?locationDeckenmalareiUrl)
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],mul,de,en". }
}
LIMIT 100`,
      emoji: "🎨",
      title: "Artworks and locations related to {itemLabel} with deckenmalerei.eu data",
    },
    {
      id: "employerGraph",
      scope: "value",
      propertyId: ["P108"],
      valueId: null,
      template: `#defaultView:Graph
SELECT DISTINCT ?employee ?employeeLabel ?imageEmp ?org ?orgLabel ?imageOrg WHERE {
  VALUES ?org {
    wd:{valueQid}
  }
  ?employee wdt:P108 ?org.
  OPTIONAL { ?employee wdt:P18 ?imageEmp. }
  OPTIONAL { ?org wdt:P154 ?imageOrg. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". }
}
LIMIT 100`,
      emoji: "👥",
      title: "Other employees of {valueLabel}",
    },
    {
      id: "entityGraph",
      scope: "entity",
      template: `#defaultView:Graph
SELECT ?node ?nodeLabel ?nodeImage ?childNode ?childNodeLabel ?childNodeImage ?rgb WHERE {
  # wikibase:directClaim binds ?p to the wdt: predicates only, which both
  # constrains the otherwise open ?s ?p ?o scan and makes the rdf:type and
  # entity/P filters redundant. Same 123 rows on Q42, 3s instead of 52s.
  {
    BIND(wd:{itemQid} AS ?node)
    ?childNode wikibase:directClaim ?p.
    ?node ?p ?i.
    FILTER(STRSTARTS(STR(?i), "http://www.wikidata.org/entity/Q"))
  }
  UNION
  {
    BIND("EFFBD8" AS ?rgb)
    ?node wikibase:directClaim ?p.
    wd:{itemQid} ?p ?childNode.
    FILTER(STRSTARTS(STR(?childNode), "http://www.wikidata.org/entity/Q"))
  }
  OPTIONAL { ?node wdt:P18 ?nodeImage. }
  OPTIONAL { ?childNode wdt:P18 ?childNodeImage. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "{userLanguage}". }
}`,
      emoji: "🔗",
      title: "Entity Graph of {itemLabel}",
    },
    {
      id: "heritageMonumentsMap",
      scope: "value",
      propertyId: ["P2817"],
      valueId: null,
      template: `#defaultView:Map
SELECT DISTINCT ?monument ?monumentLabel ?coordinates ?heritageStatusLabel ?image WHERE {
  ?monument wdt:P2817 wd:{valueQid};
    wdt:P625 ?coordinates.
  OPTIONAL { ?monument wdt:P1435 ?heritageStatus. }
  OPTIONAL { ?monument wdt:P18 ?image. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],mul,en". }
}
LIMIT 2000`,
      emoji: "🏰",
      title: "Map of all monuments on {valueLabel}",
    },
    {
      id: "namedAfterList",
      scope: "value",
      propertyId: ["P138"],
      valueId: null,
      template: `SELECT DISTINCT ?item ?itemLabel ?typeLabel ?countryLabel ?image WHERE {
  ?item wdt:P138 wd:{valueQid}.
  OPTIONAL { ?item wdt:P31 ?type. }
  OPTIONAL { ?item wdt:P17 ?country. }
  OPTIONAL { ?item wdt:P18 ?image. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],mul,en". }
}
LIMIT 1000`,
      emoji: "📋",
      title: "Everything named after {valueLabel}",
    },
    {
      id: "namedAfterMap",
      scope: "value",
      propertyId: ["P138"],
      valueId: null,
      template: `#defaultView:Map
SELECT DISTINCT ?item ?itemLabel ?coordinates ?image ?countryLabel WHERE {
  ?item wdt:P138 wd:{valueQid};
    wdt:P625 ?coordinates.
  OPTIONAL { ?item wdt:P17 ?country. }
  OPTIONAL { ?item wdt:P18 ?image. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],mul,en". }
}
LIMIT 1000`,
      emoji: "🗺️",
      title: "Map of places named after {valueLabel}",
    },
    {
      id: "objectsStreet",
      scope: "value",
      propertyId: ["P669"],
      template: `SELECT ?itemLabel ?item ?housenumber WHERE {
  ?item wdt:P669 wd:{valueQid}.
  OPTIONAL {
    ?item p:P669 ?number.
    ?number pq:P670 ?housenumber.
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],mul,en". }
}
LIMIT 100`,
      emoji: "📍",
      title: "Other objects on {itemLabel}",
    },
    {
      id: "painterPlacesMap",
      scope: "value",
      propertyId: ["P106"],
      valueId: ["Q1028181"],
      template: `#defaultView:Map
SELECT DISTINCT ?place ?placeLabel ?coords ?layer WHERE {
  # Birth place
  {
    wd:{itemQid} wdt:P19 ?place.
    ?place wdt:P625 ?coords.
    BIND("Birth place" AS ?layer)
  }
  UNION
  # Death place
  {
    wd:{itemQid} wdt:P20 ?place.
    ?place wdt:P625 ?coords.
    BIND("Death place" AS ?layer)
  }
  UNION
  # Work location
  {
    wd:{itemQid} wdt:P937 ?place.
    ?place wdt:P625 ?coords.
    BIND("Work location" AS ?layer)
  }
  UNION
  # Museums/institutions with painter's works
  {
    ?artwork wdt:P170 wd:{itemQid}.
    ?artwork wdt:P195 ?place.
    ?place wdt:P625 ?coords.
    BIND("Museum/Collection" AS ?layer)
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],mul,en". }
}`,
      emoji: "🗺️",
      title: "Places related to {itemLabel}",
    },
    {
      id: "positionTimeline",
      scope: "property",
      propertyId: ["P1308","P488","P6","P35","P169","P1037","P210"],
      template: `#defaultView:Timeline
SELECT ?positionHolder ?positionHolderLabel ?roleLabel ?startTime ?endTime ?image WHERE {
  VALUES (?p ?ps) {
    (p:P1308 ps:P1308)
    (p:P488 ps:P488)
    (p:P6 ps:P6)
    (p:P35 ps:P35)
    (p:P169 ps:P169)
    (p:P1037 ps:P1037)
  }
  wd:{itemQid} ?p ?statement.
  ?statement ?ps ?positionHolder;
    pq:P580 ?startTime.
  ?role wikibase:claim ?p.
  OPTIONAL { ?statement pq:P582 ?endTime. }
  OPTIONAL { ?positionHolder wdt:P18 ?image. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],mul,en". }
}
ORDER BY ?startTime`,
      emoji: "🏛️",
      title: "Officeholders of {itemLabel}",
    },
  ];

  // ===== USEFUL LINKS CONFIGURATION =====
  // Add new external links here - they will automatically be attached to the right places

  /** @type {UsefulLink[]} */
  const USEFUL_LINKS = [
    {
      id: "entitree",
      scope: "property",
      propertyId: ["P22","P25","P3373","P26","P40","P1038","P3448","P8810"],
      urlTemplate: "https://entitree.com/{userLanguage}/family_tree/{itemQid}",
      emoji: "🌳",
      title: "Family tree on Entitree",
    },
    {
      id: "entitree",
      scope: "property",
      propertyId: ["P1066","P802"],
      urlTemplate: "https://entitree.com/{userLanguage}/student/{itemQid}",
      emoji: "🎓",
      title: "Academic lineage on Entitree",
    },
    {
      id: "scholia",
      scope: "value",
      propertyId: ["P106"],
      valueId: ["Q1650915"],
      urlTemplate: "https://scholia.toolforge.org/author/{itemQid}",
      emoji: "📚",
      title: "Page on Scholia",
    },
    {
      id: "wikishootme",
      scope: "value",
      propertyId: ["P625"],
      valueId: null,
      urlTemplate: "https://wikishootme.toolforge.org/#lat={valueLat}&lng={valueLon}&zoom=19",
      emoji: "📷",
      title: "Items in the immediate surroundings on WikiShootMe",
    },
  ];

  // ===== HELPER FUNCTIONS =====

  /**
   * Replace placeholders in a template string
   * @param {string} template - Template with placeholders like {itemQid}, {itemLabel}, etc.
   * @param {Object} replacements - Key-value pairs for replacements
   * @returns {string} Template with placeholders replaced
   */
  function replacePlaceholders(template, replacements) {
    let result = template;
    for (const [key, value] of Object.entries(replacements)) {
      result = result.replaceAll(`{${key}}`, value || "");
    }
    return result;
  }

  /**
   * Encode a query string for use in URLs
   * @param {string} query - The SPARQL query
   * @returns {string} URL-encoded query with # prefix
   */
  function encodeQueryString(query) {
    return "#" + encodeURIComponent(query);
  }

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

// ===== UI CREATION FUNCTIONS =====

/**
 * Create a Codex button with a link
 * @param {jQuery} element - The element to append the button to
 * @param {string} url - The URL to open when clicked
 * @param {string} buttonLabel - The label (emoji/text) for the button
 * @param {string} title - The tooltip for the button
 */
function createLinkButton(element, url, buttonLabel, title) {
  mw.loader.using("@wikimedia/codex").then(function (require) {
    const Vue = require("vue");
    const Codex = require("@wikimedia/codex");

    const mountPoint = document.createElement("span");
    $(element).append(mountPoint);

    const app = Vue.createMwApp({
      name: "UsefulQueriesLinkButton",
      data: function () {
        return { url, buttonLabel, title };
      },
      template: `
          <a :href="url" target="_blank" rel="noopener noreferrer" :title="title" style="text-decoration: none;">
            <cdx-button weight="quiet" action="progressive" :aria-label="title">
              {{ buttonLabel }}
            </cdx-button>
          </a>
        `,
    });

    app.component("CdxButton", Codex.CdxButton);
    app.mount(mountPoint);
  });
}

/**
 * Create a Codex popup button with an embedded query
 * @param {jQuery} element - The element to append the popup button to
 * @param {string} querystring - The encoded query string
 * @param {string} buttonLabel - The label (emoji/text) for the button
 * @param {string} title - The tooltip and popup heading
 * @param {string} scope - Template scope ("entity", "property", or "value")
 */
function createQueryPopup(
  element,
  querystring,
  buttonLabel,
  title,
  scope,
) {
  const queryServiceHref = SETTINGS.queryServiceUrl + querystring;

  mw.loader.using("@wikimedia/codex").then(function (require) {
    const Vue = require("vue");
    const Codex = require("@wikimedia/codex");

    if (!Codex.CdxPopover) {
      // Older Codex versions (e.g. some Wikibase Cloud instances) lack CdxPopover;
      // fall back to a plain link button to avoid rendering the component inline.
      createLinkButton(element, queryServiceHref, buttonLabel, title);
      return;
    }

    const mountPoint = document.createElement("span");
    $(element).append(mountPoint);

    mw.util.addCSS(".usefulqueries-popover { max-width: none !important; }");

    const placement = (scope === "value") ? "bottom" : "bottom-start";

    const widthWithMin = Math.min(Math.max(window.innerWidth - 40, 400), 800);
    const embedHref = SETTINGS.queryEmbedUrl + querystring;
    const qleverHref = getQLeverUrl(querystring);

    const app = Vue.createMwApp({
      name: "UsefulQueriesPopover",
      data: function () {
        return {
          open: false,
          anchorEl: null,
          buttonLabel,
          title,
          queryServiceHref,
          embedHref,
          qleverHref,
          iframeSize: widthWithMin,
          placement,
          primaryAction: {
            label: "Open in query service",
            actionType: "progressive",
          },
          defaultAction: qleverHref ? { label: "Open in QLever" } : null,
        };
      },
      mounted: function () {
        this.anchorEl = this.$refs.triggerEl || null;
      },
      methods: {
        openQueryService: function () {
          window.open(this.queryServiceHref, "_blank", "noopener,noreferrer");
        },
        openQLever: function () {
          if (this.qleverHref) {
            window.open(this.qleverHref, "_blank", "noopener,noreferrer");
          }
        },
      },
      template: `
          <span ref="triggerEl">
            <cdx-button
              weight="quiet"
              action="progressive"
              :aria-label="title"
              :title="title"
              @click="$event.preventDefault(); open = !open"
            >
              {{ buttonLabel }}
            </cdx-button>
          </span>

          <cdx-popover
            v-if="anchorEl"
            v-model:open="open"
            :anchor="anchorEl"
            :placement="placement"
            :render-in-place="false"
            :title="title"
            :use-close-button="true"
            :use-bottom-sheet="true"
            :primary-action="primaryAction"
            :default-action="defaultAction"
            class="usefulqueries-popover"
            style="z-index: 999;"
            @primary="openQueryService"
            @default="openQLever"
          >
            <iframe
              v-if="open"
              scrolling="yes"
              frameborder="0"
              :src="embedHref"
              :width="iframeSize"
              :height="iframeSize"
            ></iframe>
          </cdx-popover>
        `,
    });

    app.component("CdxButton", Codex.CdxButton);
    app.component("CdxPopover", Codex.CdxPopover);
    app.mount(mountPoint);
  });
}

// ===== DOM HELPER FUNCTIONS =====

/**
 * Get the DOM element for a property group by property ID
 * @param {string} propertyId - The property ID (e.g., "P106")
 * @returns {jQuery|null} The property label element or null if not found
 */
function getPropertyElement(propertyId) {
  // Desktop
  const $propertyLink = $(
    '.wikibase-statementgroupview-property-label a[title="Property:' +
      propertyId +
      '"]',
  );
  if ($propertyLink.length) {
    return $propertyLink.closest(".wikibase-statementgroupview-property-label");
  }
  // Mobile (wbui2025): only match the heading row, not property names inside references
  const $mobileLink = $(
    '.wikibase-wbui2025-statement-heading .wikibase-wbui2025-property-name-link[data-property-id="' +
      propertyId +
      '"]',
  );
  if ($mobileLink.length) {
    return $mobileLink.closest(".wikibase-wbui2025-property-name");
  }
  return null;
}

/**
 * Get the DOM element for a specific statement by statement ID
 * @param {string} statementId - The full statement ID
 * @returns {jQuery|null} The statement element or null if not found
 */
function getStatementElement(statementId) {
  const $statement = $("#" + CSS.escape(statementId));
  return $statement.length ? $statement : null;
}

/**
 * Get the indicator element for a statement where buttons can be attached
 * @param {jQuery} $statementElement - The statement element
 * @returns {jQuery|null} The indicator element or null if not found
 */
function getStatementIndicatorElement($statementElement) {
  // Desktop
  const $desktop = $statementElement.find(".wikibase-snakview-indicators").first();
  if ($desktop.length) return $desktop;
  // Mobile (wbui2025)
  return $statementElement
    .find(".wikibase-wbui2025-main-snak .wikibase-wbui2025-snak-value")
    .first();
}

/**
 * Extract the displayed label text from a statement's main value in the DOM
 * @param {jQuery} $statementElement - The statement element
 * @returns {string|null} The label text or null if not found
 */
function getStatementValueLabel($statementElement) {
  // Desktop
  const $desktop = $statementElement.find(".wikibase-snakview-value a").first();
  if ($desktop.length) return $desktop.text().trim() || null;
  // Mobile (wbui2025)
  const $mobile = $statementElement
    .find(".wikibase-wbui2025-main-snak .wikibase-wbui2025-snak-value .snakValue a")
    .first();
  if ($mobile.length) return $mobile.text().trim() || null;
  return null;
}

/**
 * Extract value details from a claim's mainsnak
 * @param {Object} mainsnak - The mainsnak object from the claim
 * @returns {{value: string|null, label: string|null, latitude?: string, longitude?: string}} Value details
 */
function extractValueFromMainsnak(mainsnak) {
  if (!mainsnak || mainsnak.snaktype !== "value" || !mainsnak.datavalue) {
    return { value: null, label: null };
  }

  const datavalue = mainsnak.datavalue;

  switch (datavalue.type) {
    case "wikibase-entityid":
      return { value: datavalue.value.id, label: null };
    case "time":
      return {
        value: '"' + datavalue.value.time + '"^^xsd:dateTime',
        label: datavalue.value.time,
      };
    case "quantity":
      return { value: datavalue.value.amount, label: datavalue.value.amount };
    case "string":
      return { value: '"' + datavalue.value + '"', label: datavalue.value };
    case "globecoordinate": {
      // Kept as strings so that a latitude/longitude of exactly 0 survives the
      // falsy check in replacePlaceholders().
      const lat = String(datavalue.value.latitude);
      const lon = String(datavalue.value.longitude);
      return {
        value: '"Point(' + lon + " " + lat + ')"^^geo:wktLiteral',
        label: lat + ", " + lon,
        latitude: lat,
        longitude: lon,
      };
    }
    default:
      return { value: null, label: null };
  }
}

// ===== PROCESSING FUNCTIONS =====

// Pre-built lookup indexes — avoids full-array scans on every property/claim.
// Built once at script load; keys are "<scope>:<propertyId>".
const _templateIndex = (function () {
  function buildIndex(templates) {
    const entity = [];
    const byKey = new Map();
    for (const t of templates) {
      if (t.scope === "entity") {
        entity.push(t);
      } else {
        const ids = Array.isArray(t.propertyId) ? t.propertyId : [t.propertyId];
        for (const id of ids) {
          const key = t.scope + ":" + id;
          if (!byKey.has(key)) byKey.set(key, []);
          byKey.get(key).push(t);
        }
      }
    }
    return { entity, byKey };
  }
  return {
    queries: buildIndex(USEFUL_QUERIES),
    links: buildIndex(USEFUL_LINKS),
  };
})();

function matchesValueId(valueId, configValueId) {
  if (!configValueId || configValueId.length === 0) return true;
  return configValueId.includes(valueId);
}

/**
 * Process entity-level features (attached to the entity title)
 * @param {jQuery} $titleElement - The title element
 * @param {Object} context - Context with itemQid, itemLabel, userLanguage
 */
function processEntityFeatures($titleElement, context) {
  // Process entity-level queries
  for (const query of _templateIndex.queries.entity) {
    const queryText = replacePlaceholders(query.template, context);
    const queryString = encodeQueryString(queryText);
    createQueryPopup(
      $titleElement,
      queryString,
      query.emoji,
      replacePlaceholders(query.title, context),
      "entity",
    );
  }

  // Process entity-level links
  for (const link of _templateIndex.links.entity) {
    const url = replacePlaceholders(link.urlTemplate, context);
    createLinkButton($titleElement, url, link.emoji, link.title);
  }
}

/**
 * Process property-level features
 * @param {string} propertyId - The property ID
 * @param {jQuery} $propertyElement - The property DOM element
 * @param {Object} context - Context with itemQid, itemLabel, userLanguage
 */
function processPropertyFeatures(propertyId, $propertyElement, context) {
  const propKey = "property:" + propertyId;

  // Process property-level queries
  for (const query of (_templateIndex.queries.byKey.get(propKey) ?? [])) {
    const queryText = replacePlaceholders(query.template, context);
    const queryString = encodeQueryString(queryText);
    createQueryPopup(
      $propertyElement,
      queryString,
      query.emoji,
      replacePlaceholders(query.title, context),
      "property",
    );
  }

  // Process property-level links
  for (const link of (_templateIndex.links.byKey.get(propKey) ?? [])) {
    const url = replacePlaceholders(link.urlTemplate, context);
    createLinkButton($propertyElement, url, link.emoji, link.title);
  }
}

/**
 * Process value-level features
 * @param {string} propertyId - The property ID
 * @param {Object} valueDetails - The value details (value, label)
 * @param {jQuery} $indicatorElement - The indicator DOM element
 * @param {Object} context - Context with itemQid, itemLabel, userLanguage
 */
function processValueFeatures(
  propertyId,
  valueDetails,
  $indicatorElement,
  context,
) {
  if (!valueDetails.value) return;

  const valueContext = {
    ...context,
    valueQid: valueDetails.value,
    valueLabel: valueDetails.label || valueDetails.value,
    // Only set for globe-coordinate values (e.g. P625); empty elsewhere.
    valueLat: valueDetails.latitude || "",
    valueLon: valueDetails.longitude || "",
  };

  const valueKey = "value:" + propertyId;

  // Process value-level queries
  for (const query of (_templateIndex.queries.byKey.get(valueKey) ?? [])) {
    if (!matchesValueId(valueDetails.value, query.valueId)) continue;
    const queryText = replacePlaceholders(query.template, valueContext);
    const queryString = encodeQueryString(queryText);
    createQueryPopup(
      $indicatorElement,
      queryString,
      query.emoji,
      replacePlaceholders(query.title, valueContext),
      "value",
    );
  }

  // Process value-level links
  for (const link of (_templateIndex.links.byKey.get(valueKey) ?? [])) {
    if (!matchesValueId(valueDetails.value, link.valueId)) continue;
    const url = replacePlaceholders(link.urlTemplate, valueContext);
    createLinkButton($indicatorElement, url, link.emoji, link.title);
  }
}

/**
 * Process a single claim (statement) from the entity data
 * @param {string} propertyId - The property ID
 * @param {Object} claim - The claim object from entityData.claims
 * @param {Object} context - Context with itemQid, itemLabel, userLanguage
 */
function processClaim(propertyId, claim, context) {
  const $statementElement = getStatementElement(claim.id);
  if (!$statementElement) return;

  const $indicatorElement = getStatementIndicatorElement($statementElement);
  if (!$indicatorElement) return;

  const valueDetails = extractValueFromMainsnak(claim.mainsnak);
  if (valueDetails.label === null) {
    valueDetails.label = getStatementValueLabel($statementElement);
  }
  processValueFeatures(propertyId, valueDetails, $indicatorElement, context);
}

/**
 * Process all claims for a property
 * @param {string} propertyId - The property ID
 * @param {Array} claims - Array of claims for this property
 * @param {Object} context - Context with itemQid, itemLabel, userLanguage
 */
function processPropertyClaims(propertyId, claims, context) {
  const $propertyElement = getPropertyElement(propertyId);

  if ($propertyElement) {
    processPropertyFeatures(propertyId, $propertyElement, context);
  }

  claims.forEach((claim) => processClaim(propertyId, claim, context));
}

// ===== MAIN =====

/**
 * Main function to orchestrate the processing of the Wikibase entity page
 */
function processWikibaseEntityPage() {
  mw.hook("wikibase.entityPage.entityLoaded").add(function (entityData) {
    if (entityData.type !== "item") {
      return;
    }

    const $labelEl = $(".wikibase-title").first().find(".wikibase-title-label");
    const itemLabel =
      $labelEl.find("span[lang]").first().text() ||
      $labelEl.clone().find(".wb-language-fallback-indicator").remove().end().text().trim() ||
      $("h2.wb-ui-label--primary").first().text();
    let $titleElement = $(".wikibase-title").first().find(".wikibase-title-id");
    if (!$titleElement.length) {
      $titleElement = $("h2.wb-ui-label--primary").first();
    }
    const userLanguage = mw.config.get("wgUserLanguage");

    const context = {
      itemQid: entityData.id,
      itemLabel: itemLabel,
      userLanguage: userLanguage,
    };

    // Process entity-level features
    processEntityFeatures($titleElement, context);

    // Process all claims
    Object.entries(entityData.claims).forEach(([propertyId, claims]) => {
      processPropertyClaims(propertyId, claims, context);
    });
  });
}

// Initialize the main processing
processWikibaseEntityPage();
});
