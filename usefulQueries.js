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

  // Exit the script if we're not in the main namespace (article namespace).
  if (mw.config.get("wgNamespaceNumber") !== 0) {
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
    {
      id: "artistTimeline",
      scope: "value",
      propertyId: "P106",
      valueId: "Q1028181",
      template: `#defaultView:Timeline
SELECT DISTINCT ?item ?itemLabel ?date ?edgeLabel WHERE {
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],mul,en". }
  {
    ?item wdt:P170 wd:{itemQid}.
    OPTIONAL { ?item wdt:P571 ?date. }
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
  FILTER(BOUND(?date))
}`,
      emoji: "📅",
      toolhint: "Timeline of this painter's works, birth and death",
      popupTitle: "Timeline of {itemLabel}",
      enabled: true,
    },
    {
      id: "artworkLocationsMap",
      scope: "value",
      propertyId: "P106",
      valueId: "Q1028181",
      template: `#defaultView:Map
SELECT DISTINCT ?work ?workLabel ?location ?locationLabel ?coordinates ?imageOfLocation ?image WHERE {
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],mul,de,en". }
  ?work wdt:P170 wd:{itemQid};
    wdt:P276 ?location.
  ?location wdt:P625 ?coordinates.
  OPTIONAL {?location wdt:P18 ?imageOfLocation.}
  OPTIONAL {?work wdt:P18 ?image.}
}
LIMIT 100`,
      emoji: "📍",
      toolhint: "Map showing locations of this painter's artworks",
      popupTitle: "Artwork locations of {itemLabel}",
      enabled: true,
    },
    {
      id: "artworks",
      scope: "value",
      propertyId: "P106",
      valueId: "Q1028181",
      template: `#defaultView:ImageGrid
SELECT ?item ?creator ?creatorLabel ?image WHERE {
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". }
  ?item wdt:P170 wd:{itemQid}.
  OPTIONAL { ?item wdt:P18 ?image. }
}
LIMIT 100`,
      emoji: "🖼️",
      toolhint: "Artworks by this painter in Wikimedia Commons",
      popupTitle: "Artworks by {itemLabel}",
      enabled: true,
    },
    {
      id: "deckenmalareiArtworkMap",
      scope: "property",
      propertyId: "P10626",
      template: `#defaultView:Map
SELECT DISTINCT ?work ?workLabel ?location ?locationLabel ?coordinates ?imageOfLocation ?image ?workDeckenmalareiId ?workDeckenmalareiUrl ?locationDeckenmalareiId ?locationDeckenmalareiUrl WHERE {
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],mul,de,en". }
  
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
}
LIMIT 100`,
      emoji: "🎨",
      toolhint: "Map of artworks and locations with deckenmalerei.eu connections",
      popupTitle: "Artworks and locations related to {itemLabel} with deckenmalerei.eu data",
      enabled: true,
    },
    {
      id: "employerGraph",
      scope: "value",
      propertyId: "P108",
      valueId: null,
      template: `#defaultView:Graph
SELECT DISTINCT ?employee ?employeeLabel ?imageEmp ?org ?orgLabel ?imageOrg WHERE {
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". }
  VALUES ?org {
    wd:{valueQid}
  }
  ?employee wdt:P108 ?org.
  OPTIONAL { ?employee wdt:P18 ?imageEmp. }
  OPTIONAL { ?org wdt:P154 ?imageOrg. }
}
LIMIT 100`,
      emoji: "👥",
      toolhint: "Other employees of this organization as graph",
      popupTitle: "100 other employees of {valueLabel}",
      enabled: true,
    },
    {
      id: "entityGraph",
      scope: "entity",
      template: `#defaultView:Graph
SELECT ?node ?nodeLabel ?nodeImage ?childNode ?childNodeLabel ?childNodeImage ?rgb WHERE {
  {
    BIND(wd:{itemQid} AS ?node)
    ?node ?p ?i.
    OPTIONAL { ?node wdt:P18 ?nodeImage. }
    ?childNode ?x ?p.
    ?childNode rdf:type wikibase:Property.
    FILTER(STRSTARTS(STR(?i), "http://www.wikidata.org/entity/Q"))
    FILTER(STRSTARTS(STR(?childNode), "http://www.wikidata.org/entity/P"))
  }
  UNION
  {
    BIND("EFFBD8" AS ?rgb)
    wd:{itemQid} ?p ?childNode.
    OPTIONAL { ?childNode wdt:P18 ?childNodeImage. }
    ?node ?x ?p.
    ?node rdf:type wikibase:Property.
    FILTER(STRSTARTS(STR(?childNode), "http://www.wikidata.org/entity/Q"))
  }
  OPTIONAL {
    ?node wdt:P18 ?nodeImage.
    ?childNode wdt:P18 ?childNodeImage.
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "{userLanguage}". }
}`,
      emoji: "🔗",
      toolhint: "Entity graph",
      popupTitle: "Entity Graph of {itemLabel}",
      enabled: true,
    },
    {
      id: "membersCount",
      scope: "property",
      propertyId: "P2124",
      template: `#defaultView:LineChart
SELECT ?pit ?s_count WHERE {
  wd:{itemQid} p:P2124 ?statement.
  ?statement ps:P2124 ?s_count.
  OPTIONAL { ?statement pq:P585 ?pit. }
}`,
      emoji: "📊",
      toolhint: "Members count over time",
      popupTitle: "Members count of {itemLabel} over time:",
      enabled: true,
    },
    {
      id: "painterPlacesMap",
      scope: "value",
      propertyId: "P106",
      valueId: "Q1028181",
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
      toolhint: "Map of places related to this painter",
      popupTitle: "Places related to {itemLabel}",
      enabled: true,
    },
    {
      id: "studentsCount",
      scope: "property",
      propertyId: "P2196",
      template: `#defaultView:LineChart
SELECT ?pit ?s_count WHERE {
  wd:{itemQid} p:P2196 ?statement.
  ?statement ps:P2196 ?s_count.
  OPTIONAL { ?statement pq:P585 ?pit. }
}`,
      emoji: "📊",
      toolhint: "Students count over time",
      popupTitle: "Students count of \"{itemLabel}\" over time:",
      enabled: true,
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
      urlTemplate: "https://www.entitree.com/en/family_tree/{itemQid}?0u0=u&0u1=u",
      emoji: "🌳",
      toolhint: "Family tree on Entitree",
      enabled: true,
    },
    {
      id: "entitree",
      scope: "property",
      propertyId: ["P1066","P802"],
      urlTemplate: "https://www.entitree.com/en/student/{itemQid}",
      emoji: "🎓",
      toolhint: "Academic lineage on Entitree",
      enabled: true,
    },
    {
      id: "scholia",
      scope: "value",
      propertyId: "P106",
      valueId: "Q1650915",
      urlTemplate: "https://scholia.toolforge.org/author/{itemQid}",
      emoji: "📚",
      toolhint: "Page on Scholia",
      enabled: true,
    },
  ];

  // ===== GLOBAL SETTINGS =====
  const SETTINGS = {
    queryServiceUrl: "https://query.wikidata.org/",
    queryEmbedUrl: "https://query.wikidata.org/embed.html",
    enableQLever: true,
    qleverUrl: "https://qlever.cs.uni-freiburg.de/wikidata/",
  };

  // ===== HELPER FUNCTIONS =====

  /**
   * Replace placeholders in a template string
   * @param {string} template - Template with placeholders like {itemQid}, {itemLabel}, etc.
   * @param {Object} replacements - Key-value pairs for replacements
   * @returns {string} Template with placeholders replaced
   */
  function replacePlaceholders(template, replacements) {
    let result = template;
    Object.entries(replacements).forEach(([key, value]) => {
      result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value || "");
    });
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
    if (defaultViewMatch) {
      qleverQuery =
        defaultViewMatch[1] +
        prefixDeclarations +
        qleverQuery.substring(defaultViewMatch[1].length);
    } else {
      qleverQuery = prefixDeclarations + qleverQuery;
    }
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

// ===== UI CREATION FUNCTIONS =====

/**
 * Create a Codex button with a link
 * @param {jQuery} element - The element to append the button to
 * @param {string} url - The URL to open when clicked
 * @param {string} buttonLabel - The label (emoji/text) for the button
 * @param {string} toolhint - The tooltip for the button
 */
function createLinkButton(element, url, buttonLabel, toolhint) {
  mw.loader.using("@wikimedia/codex").then(function (require) {
    const Vue = require("vue");
    const Codex = require("@wikimedia/codex");

    const mountPoint = document.createElement("span");
    $(element).append(mountPoint);

    const app = Vue.createMwApp({
      name: "UsefulQueriesLinkButton",
      data: function () {
        return { url, buttonLabel, toolhint };
      },
      template: `
          <a :href="url" target="_blank" rel="noopener noreferrer" :title="toolhint" style="text-decoration: none;">
            <cdx-button weight="quiet" action="progressive" :aria-label="toolhint">
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
 * @param {string} toolhint - The tooltip for the button
 * @param {string} toplabel - The title for the popup
 */
function createQueryPopup(
  element,
  querystring,
  buttonLabel,
  toolhint,
  toplabel,
) {
  const queryServiceHref = SETTINGS.queryServiceUrl + querystring;

  if (window.innerWidth < 900) {
    createLinkButton(element, queryServiceHref, buttonLabel, toolhint);
    return;
  }

  mw.loader.using("@wikimedia/codex").then(function (require) {
    const Vue = require("vue");
    const Codex = require("@wikimedia/codex");

    const mountPoint = document.createElement("span");
    $(element).append(mountPoint);

    mw.util.addCSS(".usefulqueries-popover { max-width: none !important; }");

    const widthWithMin = Math.max(
      Math.min(window.screen.width, window.innerWidth / 2),
      800,
    );
    const embedHref = SETTINGS.queryEmbedUrl + querystring;
    const qleverHref = getQLeverUrl(querystring);

    const app = Vue.createMwApp({
      name: "UsefulQueriesPopover",
      data: function () {
        return {
          open: false,
          anchorEl: null,
          buttonLabel,
          toolhint,
          toplabel,
          queryServiceHref,
          embedHref,
          qleverHref,
          iframeSize: widthWithMin,
        };
      },
      mounted: function () {
        this.anchorEl = this.$refs.triggerEl || null;
      },
      template: `
          <span ref="triggerEl">
            <cdx-button
              weight="quiet"
              action="progressive"
              :aria-label="toolhint"
              :title="toolhint"
              @click="$event.preventDefault(); open = !open"
            >
              {{ buttonLabel }}
            </cdx-button>
          </span>

          <cdx-popover
            v-if="anchorEl"
            v-model:open="open"
            :anchor="anchorEl"
            placement="bottom"
            :render-in-place="false"
            :title="toplabel"
            :use-close-button="true"
            class="usefulqueries-popover"
            style="z-index: 9999;"
          >
            <div>
              <div v-if="qleverHref" style="padding: 10px; border-bottom: 1px solid;">
                <a :href="qleverHref" target="_blank" rel="noopener noreferrer">
                  Run query on QLever (alternative query service)
                </a>
              </div>
              <iframe
                v-if="open"
                scrolling="yes"
                frameborder="0"
                :src="embedHref"
                :width="iframeSize"
                :height="iframeSize"
              ></iframe>
            </div>
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
 * Extract value details from a claim's mainsnak
 * @param {Object} mainsnak - The mainsnak object from the claim
 * @returns {{value: string|null, label: string|null}} Value details
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
    default:
      return { value: null, label: null };
  }
}

// ===== PROCESSING FUNCTIONS =====

/**
 * Check if a property ID matches a query/link configuration
 * @param {string} propertyId - The property ID to check
 * @param {string|string[]} configPropertyId - The configured property ID(s)
 * @returns {boolean} True if matches
 */
function matchesPropertyId(propertyId, configPropertyId) {
  if (Array.isArray(configPropertyId)) {
    return configPropertyId.includes(propertyId);
  }
  return propertyId === configPropertyId;
}

/**
 * Process entity-level features (attached to the entity title)
 * @param {jQuery} $titleElement - The title element
 * @param {Object} context - Context with itemQid, itemLabel, userLanguage
 */
function processEntityFeatures($titleElement, context) {
  // Process entity-level queries
  USEFUL_QUERIES.filter(
    (q) => q.scope === "entity" && q.enabled !== false,
  ).forEach((query) => {
    const queryText = replacePlaceholders(query.template, context);
    const queryString = encodeQueryString(queryText);
    const popupTitle = replacePlaceholders(query.popupTitle, context);

    createQueryPopup(
      $titleElement,
      queryString,
      query.emoji,
      query.toolhint,
      popupTitle,
    );
  });

  // Process entity-level links
  USEFUL_LINKS.filter(
    (l) => l.scope === "entity" && l.enabled !== false,
  ).forEach((link) => {
    const url = replacePlaceholders(link.urlTemplate, context);
    createLinkButton($titleElement, url, link.emoji, link.toolhint);
  });
}

/**
 * Process property-level features
 * @param {string} propertyId - The property ID
 * @param {jQuery} $propertyElement - The property DOM element
 * @param {Object} context - Context with itemQid, itemLabel, userLanguage
 */
function processPropertyFeatures(propertyId, $propertyElement, context) {
  // Process property-level queries
  USEFUL_QUERIES.filter(
    (q) =>
      q.scope === "property" &&
      q.enabled !== false &&
      matchesPropertyId(propertyId, q.propertyId),
  ).forEach((query) => {
    const queryText = replacePlaceholders(query.template, context);
    const queryString = encodeQueryString(queryText);
    const popupTitle = replacePlaceholders(query.popupTitle, context);

    createQueryPopup(
      $propertyElement,
      queryString,
      query.emoji,
      query.toolhint,
      popupTitle,
    );
  });

  // Process property-level links
  USEFUL_LINKS.filter(
    (l) =>
      l.scope === "property" &&
      l.enabled !== false &&
      matchesPropertyId(propertyId, l.propertyId),
  ).forEach((link) => {
    const url = replacePlaceholders(link.urlTemplate, context);
    createLinkButton($propertyElement, url, link.emoji, link.toolhint);
  });
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
  };

  // Process value-level queries
  USEFUL_QUERIES.filter(
    (q) =>
      q.scope === "value" &&
      q.enabled !== false &&
      matchesPropertyId(propertyId, q.propertyId) &&
      (q.valueId === null || q.valueId === valueDetails.value),
  ).forEach((query) => {
    const queryText = replacePlaceholders(query.template, valueContext);
    const queryString = encodeQueryString(queryText);
    const popupTitle = replacePlaceholders(query.popupTitle, valueContext);

    createQueryPopup(
      $indicatorElement,
      queryString,
      query.emoji,
      query.toolhint,
      popupTitle,
    );
  });

  // Process value-level links
  USEFUL_LINKS.filter(
    (l) =>
      l.scope === "value" &&
      l.enabled !== false &&
      matchesPropertyId(propertyId, l.propertyId) &&
      (l.valueId === null || l.valueId === valueDetails.value),
  ).forEach((link) => {
    const url = replacePlaceholders(link.urlTemplate, valueContext);
    createLinkButton($indicatorElement, url, link.emoji, link.toolhint);
  });
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

    const itemLabel =
      $(".wikibase-title").first().find(".wikibase-title-label").text() ||
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
