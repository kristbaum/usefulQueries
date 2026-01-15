/*
 * This script provides context-based queries to statements for Wikimedia pages.
 * It creates a popup when you click on certain elements, showing data from Wikidata.
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

  // ===== WIKIBASE CONFIGURATION =====
  // Configure these values for your specific Wikibase instance
  const WIKIBASE_CONFIG = {
    // Base URLs - change these for your Wikibase instance
    queryServiceUrl: "https://query.wikidata.org/",
    queryEmbedUrl: "https://query.wikidata.org/embed.html",
    entityPrefix: "wd:",
    propertyPrefix: "wdt:",

    // Feature toggles
    enableQLever: true, // Set to false to disable QLever query links

    // Property mappings - update these IDs for your Wikibase
    properties: {
      studentsCount: "P2196",
      membersCount: "P2124",
      father: "P22",
      mother: "P25",
      sibling: "P3373",
      spouse: "P26",
      child: "P40",
      occupation: "P106",
      employer: "P108",
      creator: "P170",
      image: "P18",
      logo: "P154",
      pointInTime: "P585",
    },

    // Entity mappings - update these IDs for your Wikibase
    entities: {
      painter: "Q1028181", // painter
      researcher: "Q1650915", // researcher
    },

    // External service URLs
    externalServices: {
      entitree: "https://www.entitree.com/en/family_tree/",
      scholia: "https://scholia.toolforge.org/author/",
    },

    queryTemplates: {
      students: `#defaultView:LineChart
SELECT ?pit ?s_count WHERE {
  {entityPrefix}{entityQid} p:{studentsCount} ?statement.
  ?statement ps:{studentsCount} ?s_count.
  OPTIONAL { ?statement pq:{pointInTime} ?pit. }
}`,
      membersCount: `#defaultView:LineChart
SELECT ?pit ?s_count WHERE {
  {entityPrefix}{entityQid} p:{membersCount} ?statement.
  ?statement ps:{membersCount} ?s_count.
  OPTIONAL { ?statement pq:{pointInTime} ?pit. }
}`,
      artworks: `#defaultView:ImageGrid
SELECT ?item ?creator ?creatorLabel ?image WHERE {
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". }
  ?item {propertyPrefix}{creator} {entityPrefix}{entityQid}.
  OPTIONAL { ?item {propertyPrefix}{image} ?image. }
}
LIMIT 100`,
      employer: `#defaultView:Graph
SELECT DISTINCT ?employee ?employeeLabel ?imageEmp ?org ?orgLabel ?imageOrg WHERE {
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". }
  VALUES ?org {
    {entityPrefix}{targetEntityQid}
  }
  ?employee {propertyPrefix}{employer} ?org.
  OPTIONAL { ?employee {propertyPrefix}{image} ?imageEmp. }
  OPTIONAL { ?org {propertyPrefix}{logo} ?imageOrg. }
}
LIMIT 100`,
      entityGraph: `#defaultView:Graph
SELECT ?node ?nodeLabel ?nodeImage ?childNode ?childNodeLabel ?childNodeImage ?rgb WHERE {
  {
    BIND({entityPrefix}{entityQid} AS ?node)
    ?node ?p ?i.
    OPTIONAL { ?node {propertyPrefix}{image} ?nodeImage. }
    ?childNode ?x ?p.
    ?childNode rdf:type wikibase:Property.
    FILTER(STRSTARTS(STR(?i), "http://www.wikidata.org/entity/Q"))
    FILTER(STRSTARTS(STR(?childNode), "http://www.wikidata.org/entity/P"))
  }
  UNION
  {
    BIND("EFFBD8" AS ?rgb)
    {entityPrefix}{entityQid} ?p ?childNode.
    OPTIONAL { ?childNode {propertyPrefix}{image} ?childNodeImage. }
    ?node ?x ?p.
    ?node rdf:type wikibase:Property.
    FILTER(STRSTARTS(STR(?childNode), "http://www.wikidata.org/entity/Q"))
  }
  OPTIONAL {
    ?node {propertyPrefix}{image} ?nodeImage.
    ?childNode {propertyPrefix}{image} ?childNodeImage.
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "{userLanguage}". }
}`,
    },
  };

  /**
   * Helper function to replace property and entity placeholders in query strings
   * @param {string} queryString - The query string with placeholders
   * @param {Object} replacements - Object containing replacement values
   * @returns {string} Updated query string
   */
  function replaceQueryPlaceholders(queryString, replacements = {}) {
    let result = queryString;

    // Replace base configuration placeholders first
    result = result.replace(/{entityPrefix}/g, WIKIBASE_CONFIG.entityPrefix);
    result = result.replace(
      /{propertyPrefix}/g,
      WIKIBASE_CONFIG.propertyPrefix,
    );

    // Replace property placeholders
    Object.entries(WIKIBASE_CONFIG.properties).forEach(([key, value]) => {
      const placeholder = `{${key}}`;
      result = result.replace(new RegExp(placeholder, "g"), value);
    });

    // Replace entity placeholders
    Object.entries(WIKIBASE_CONFIG.entities).forEach(([key, value]) => {
      const placeholder = `{${key}}`;
      result = result.replace(new RegExp(placeholder, "g"), value);
    });

    // Replace custom replacements
    Object.entries(replacements).forEach(([key, value]) => {
      const placeholder = `{${key}}`;
      result = result.replace(new RegExp(placeholder, "g"), value);
    });

    // Return the encoded String
    return "#" + encodeURIComponent(result);
  }

  /**
   * Check if the current Wikibase is Wikidata
   * @returns {boolean} True if using Wikidata
   */
  function isWikidata() {
    return WIKIBASE_CONFIG.queryServiceUrl.includes("query.wikidata.org");
  }

  /**
   * Convert a Wikidata SPARQL query to QLever-compatible format
   * @param {string} query - The original SPARQL query
   * @returns {string} QLever-compatible SPARQL query
   */
  function convertToQLeverQuery(query) {
    // Replace Wikidata's wikibase:label service with standard SPARQL labels
    let qleverQuery = query;

    // Add necessary PREFIX declarations if not present
    const needsRdfsPrefix =
      !qleverQuery.includes("PREFIX rdfs:") &&
      qleverQuery.includes("rdfs:label");
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

      // Insert prefixes at the beginning, after any existing #defaultView comments
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

      // Insert label statements before the closing brace
      const lastBraceIndex = qleverQuery.lastIndexOf("}");
      if (lastBraceIndex !== -1 && labelStatements) {
        qleverQuery =
          qleverQuery.slice(0, lastBraceIndex) +
          labelStatements +
          qleverQuery.slice(lastBraceIndex);
      }
    }

    // Clean up extra whitespace
    qleverQuery = qleverQuery.replace(/\n\s*\n/g, "\n").trim();

    return qleverQuery;
  }

  /**
   * Returns the QLeverUrl
   * @param {string} querystring
   * @returns
   */
  function getQLeverUrl(querystring) {
    // Decode the query string (remove # and decode)
    const decodedQuery = decodeURIComponent(querystring.substring(1));
    // Convert to QLever-compatible format
    const qleverQuery = convertToQLeverQuery(decodedQuery);
    // Encode for QLever
    return (
      "https://qlever.cs.uni-freiburg.de/wikidata/?query=" +
      encodeURIComponent(qleverQuery)
    );
  }

  /**
   * Create a Codex button with a link and label.
   * @param {jQuery} element - The element to append the button to.
   * @param {string} url - The URL to open when the button is clicked.
   * @param {string} buttonLabel - The label (emoji/text) for the button.
   * @param {string} toolhint - The tooltip for the button.
   */
  function createIconWithLink(element, url, buttonLabel, toolhint) {
    mw.loader.using("@wikimedia/codex").then(function (require) {
      const Vue = require("vue");
      const Codex = require("@wikimedia/codex");

      const mountPoint = document.createElement("span");
      $(element).append(mountPoint);

      const app = Vue.createMwApp({
        name: "UsefulQueriesLinkButton",
        data: function () {
          return {
            url: url,
            buttonLabel: buttonLabel,
            toolhint: toolhint,
          };
        },
        template: `
          <cdx-button
            :href="url"
            target="_blank"
            rel="noopener noreferrer"
            weight="quiet"
            action="progressive"
            :aria-label="toolhint"
            :title="toolhint"
          >
            {{ buttonLabel }}
          </cdx-button>
        `,
      });

      app.component("CdxButton", Codex.CdxButton);
      app.mount(mountPoint);
    });
  }

  /**
   * Create a Codex popup button and add it to the specified element.
   * @param {jQuery} element - The element to append the popup button to.
   * @param {string} querystring - The query string for the query service.
   * @param {string} buttonLabel - The label (emoji/text) for the button.
   * @param {string} toolhint - The tooltip for the button.
   * @param {string} toplabel - The title for the popup.
   */
  function createPopupAndAddIcon(
    element,
    querystring,
    buttonLabel,
    toolhint,
    toplabel,
  ) {
    mw.loader.using("@wikimedia/codex").then(function (require) {
      const Vue = require("vue");
      const Codex = require("@wikimedia/codex");

      const mountPoint = document.createElement("span");
      $(element).append(mountPoint);

      const widthWithMin = Math.max(window.screen.width / 3, 600);

      const queryServiceHref = WIKIBASE_CONFIG.queryServiceUrl + querystring;
      const embedHref = WIKIBASE_CONFIG.queryEmbedUrl + querystring;
      // Only generate QLever URL if the feature is enabled and we're on Wikidata
      const qleverHref =
        WIKIBASE_CONFIG.enableQLever && isWikidata()
          ? getQLeverUrl(querystring)
          : null;

      const app = Vue.createMwApp({
        name: "UsefulQueriesPopover",
        data: function () {
          return {
            open: false,
            anchorEl: null,
            buttonLabel: buttonLabel,
            toolhint: toolhint,
            toplabel: toplabel,
            queryServiceHref: queryServiceHref,
            embedHref: embedHref,
            qleverHref: qleverHref,
            iframeSize: widthWithMin,
          };
        },
        mounted: function () {
          this.anchorEl = this.$refs.triggerEl || null;
        },
        template: `
          <span ref="triggerEl">
            <cdx-button
              :href="queryServiceHref"
              target="_blank"
              rel="noopener noreferrer"
              weight="quiet"
              action="progressive"
              :aria-label="toolhint"
              :title="toolhint"
              @click.prevent="open = !open"
            >
              {{ buttonLabel }}
            </cdx-button>
          </span>

          <cdx-popover
            v-if="anchorEl"
            v-model:open="open"
            :anchor="anchorEl"
            placement="bottom-start"
            :render-in-place="true"
            :title="toplabel"
            :use-close-button="true"
          >
            <div>
              <iframe
                v-if="open"
                scrolling="yes"
                frameborder="0"
                :src="embedHref"
                :width="iframeSize"
                :height="iframeSize"
              ></iframe>

              <div v-if="qleverHref" style="padding: 10px; border-top: 1px solid;">
                <a :href="qleverHref" target="_blank" rel="noopener noreferrer">
                  Run query on QLever (alternative query service)
                </a>
              </div>
            </div>
          </cdx-popover>
        `,
      });

      app.component("CdxButton", Codex.CdxButton);
      app.component("CdxPopover", Codex.CdxPopover);
      app.mount(mountPoint);
    });
  }

  /**
   * Get the DOM element for a property group by property ID
   * @param {string} propertyId - The property ID (e.g., "P106")
   * @returns {jQuery|null} The property label element or null if not found
   */
  function getPropertyElement(propertyId) {
    const $propertyLink = $(
      '.wikibase-statementgroupview-property-label a[title="Property:' +
        propertyId +
        '"]',
    );
    if ($propertyLink.length) {
      return $propertyLink.closest(
        ".wikibase-statementgroupview-property-label",
      );
    }
    return null;
  }

  /**
   * Get the DOM element for a specific statement by statement ID
   * @param {string} statementId - The full statement ID (e.g., "Q454172$84CA3CF1-...")
   * @returns {jQuery|null} The statement element or null if not found
   */
  function getStatementElement(statementId) {
    // Statement IDs in DOM use the format: id="Q454172$84CA3CF1-..."
    const $statement = $("#" + CSS.escape(statementId));
    if ($statement.length) {
      return $statement;
    }
    return null;
  }

  /**
   * Get the indicator element for a statement where buttons can be attached
   * @param {jQuery} $statementElement - The statement element
   * @returns {jQuery|null} The indicator element or null if not found
   */
  function getStatementIndicatorElement($statementElement) {
    return $statementElement.find(".wikibase-snakview-indicators").first();
  }

  /**
   * Extract value details from a claim's mainsnak
   * @param {Object} mainsnak - The mainsnak object from the claim
   * @returns {Object} Value details including QID and label
   */
  function extractValueFromMainsnak(mainsnak) {
    if (!mainsnak || mainsnak.snaktype !== "value" || !mainsnak.datavalue) {
      return { value: null, label: null };
    }

    const datavalue = mainsnak.datavalue;

    switch (datavalue.type) {
      case "wikibase-entityid":
        return {
          value: datavalue.value.id,
          label: null, // Label would need to be fetched separately or from DOM
        };
      case "time":
        return {
          value: '"' + datavalue.value.time + '"^^xsd:dateTime',
          label: datavalue.value.time,
        };
      case "quantity":
        return {
          value: datavalue.value.amount,
          label: datavalue.value.amount,
        };
      case "string":
        return {
          value: '"' + datavalue.value + '"',
          label: datavalue.value,
        };
      default:
        return { value: null, label: null };
    }
  }

  /**
   * Add property-level icons and popups based on property type
   * @param {string} propertyId - The property ID (e.g., "P106")
   * @param {jQuery} $propertyElement - The DOM element for the property label
   * @param {string} itemQid - Main item Qid
   * @param {string} itemLabel - Main item Label
   */
  function addPropertyLevelFeatures(
    propertyId,
    $propertyElement,
    itemQid,
    itemLabel,
  ) {
    switch (propertyId) {
      case WIKIBASE_CONFIG.properties.studentsCount:
        createPopupAndAddIcon(
          $propertyElement,
          replaceQueryPlaceholders(WIKIBASE_CONFIG.queryTemplates.students, {
            entityQid: itemQid,
          }),
          "📊",
          "Students count over time",
          'Students count of "' + itemLabel + '" over time:',
        );
        break;
      case WIKIBASE_CONFIG.properties.membersCount:
        createPopupAndAddIcon(
          $propertyElement,
          replaceQueryPlaceholders(
            WIKIBASE_CONFIG.queryTemplates.membersCount,
            {
              entityQid: itemQid,
            },
          ),
          "📊",
          "Members count over time",
          "Members count of " + itemLabel + " over time:",
        );
        break;
      case WIKIBASE_CONFIG.properties.father:
      case WIKIBASE_CONFIG.properties.mother:
      case WIKIBASE_CONFIG.properties.sibling:
      case WIKIBASE_CONFIG.properties.spouse:
      case WIKIBASE_CONFIG.properties.child:
        createIconWithLink(
          $propertyElement,
          WIKIBASE_CONFIG.externalServices.entitree + itemQid + "?0u0=u&0u1=u",
          "🌳",
          "Family tree on Entitree",
        );
        break;
    }
  }

  /**
   * Add value-level icons and popups based on property and value
   * @param {string} propertyId - The property ID (e.g., "P106")
   * @param {Object} valueDetails - Details about the value (from JSON)
   * @param {jQuery} $indicatorElement - The DOM element to attach buttons to
   * @param {string} itemQid - Main item Qid
   * @param {string} itemLabel - Main item label
   */
  function addValueLevelFeatures(
    propertyId,
    valueDetails,
    $indicatorElement,
    itemQid,
    itemLabel,
  ) {
    if (!valueDetails.value) {
      return;
    }

    switch (propertyId) {
      // Occupation based queries
      case WIKIBASE_CONFIG.properties.occupation:
        switch (valueDetails.value) {
          case WIKIBASE_CONFIG.entities.painter:
            createPopupAndAddIcon(
              $indicatorElement,
              replaceQueryPlaceholders(
                WIKIBASE_CONFIG.queryTemplates.artworks,
                {
                  entityQid: itemQid,
                },
              ),
              "🖼️",
              "Artworks by this painter in Wikimedia Commons",
              "Artworks by " + itemLabel,
            );
            break;

          case WIKIBASE_CONFIG.entities.researcher:
            createIconWithLink(
              $indicatorElement,
              WIKIBASE_CONFIG.externalServices.scholia + itemQid,
              "📚",
              "Page on Scholia",
            );
            break;
        }
        break;

      case WIKIBASE_CONFIG.properties.employer:
        createPopupAndAddIcon(
          $indicatorElement,
          replaceQueryPlaceholders(WIKIBASE_CONFIG.queryTemplates.employer, {
            targetEntityQid: valueDetails.value,
          }),
          "👥",
          "Other employees of this organization as graph",
          "100 other employees of " +
            (valueDetails.label || valueDetails.value),
        );
        break;
    }
  }

  /**
   * Process a single claim (statement) from the entity data
   * @param {string} propertyId - The property ID
   * @param {Object} claim - The claim object from entityData.claims
   * @param {string} itemQid - Main item Qid
   * @param {string} itemLabel - Main item label
   */
  function processClaim(propertyId, claim, itemQid, itemLabel) {
    // Get the statement DOM element using the statement ID
    const $statementElement = getStatementElement(claim.id);
    if (!$statementElement) {
      return;
    }

    // Get the indicator element where we can attach value-level buttons
    const $indicatorElement = getStatementIndicatorElement($statementElement);
    if (!$indicatorElement) {
      return;
    }

    // Extract value from the mainsnak
    const valueDetails = extractValueFromMainsnak(claim.mainsnak);

    // Add value-level features
    addValueLevelFeatures(
      propertyId,
      valueDetails,
      $indicatorElement,
      itemQid,
      itemLabel,
    );
  }

  /**
   * Process all claims for a property
   * @param {string} propertyId - The property ID
   * @param {Array} claims - Array of claims for this property
   * @param {string} itemQid - Main item Qid
   * @param {string} itemLabel - Main item label
   */
  function processPropertyClaims(propertyId, claims, itemQid, itemLabel) {
    // Get the property element in the DOM
    const $propertyElement = getPropertyElement(propertyId);

    // Add property-level features (only once per property)
    if ($propertyElement) {
      addPropertyLevelFeatures(
        propertyId,
        $propertyElement,
        itemQid,
        itemLabel,
      );
    }

    // Process each claim for value-level features
    claims.forEach(function (claim) {
      processClaim(propertyId, claim, itemQid, itemLabel);
    });
  }

  /**
   * Main function to orchestrate the processing of the Wikibase entity page
   */
  function processWikibaseEntityPage() {
    // Process statements when entity data is loaded
    mw.hook("wikibase.entityPage.entityLoaded").add(function (entityData) {
      if (entityData.type != "item") {
        // Not a supported data type, closing
        return;
      }

      const itemLabel = $(".wikibase-title")
        .first()
        .find(".wikibase-title-label")
        .text();
      const $titleElement = $(".wikibase-title")
        .first()
        .find(".wikibase-title-id");
      const userLanguage = mw.config.get("wgUserLanguage");

      // Create entity graph popup on the title
      createPopupAndAddIcon(
        $titleElement,
        replaceQueryPlaceholders(WIKIBASE_CONFIG.queryTemplates.entityGraph, {
          entityQid: entityData.id,
          userLanguage: userLanguage,
        }),
        "🔗",
        "Entity graph",
        "Entity Graph of " + itemLabel,
      );

      // Iterate over claims from JSON data instead of DOM elements

      Object.entries(entityData.claims).forEach(function ([
        propertyId,
        claims,
      ]) {
        processPropertyClaims(propertyId, claims, entityData.id, itemLabel);
      });
    });
  }

  // Initialize the main processing
  processWikibaseEntityPage();
});
