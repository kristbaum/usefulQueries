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
   * Extract property and value information from a statement element
   * @param {jQuery} statementElement - The statement element to process
   * @param {Object} entityData - The full entity data from Wikibase
   * @returns {Object} Property and value details
   */
  function extractStatementDetails(statementElement) {
    const statement_pid = statementElement.attr("id");
    const statement_p_element = statementElement.find(
      ".wikibase-statementgroupview-property-label",
    );
    return {
      pid: statement_pid,
      pLabel: statement_p_element.text(),
      $propertyElement: statement_p_element,
      $statementElement: statementElement,
    };
  }

  /**
   * Extract value details from a statement value element
   * @param {jQuery} valueElement - The value element to process
   * @param {Object} entityData - The full entity data from Wikibase
   * @param {string} pidTemp - The property ID
   * @returns {Object} Value details including QID and label
   */
  function extractValueDetails(valueElement, entityData, pidTemp) {
    let statement_target_qid = valueElement.find("a").attr("title");
    let statement_target_qLabel = valueElement.find("a").text();

    // Extract just the Q-number from the title (in case it contains ": Label" suffix)
    if (statement_target_qid) {
      let qidMatch = statement_target_qid.match(/^(Q\d+)/);
      if (qidMatch) {
        statement_target_qid = qidMatch[1];
      }
    }

    // Handle non-entity values
    if (!statement_target_qid) {
      if (valueElement.find("a").length === 0) {
        if (valueElement.find(".wb-monolingualtext-value").length) {
          statement_target_qLabel = valueElement
            .find(".wb-monolingualtext-value")
            .html();
          statement_target_qid = null;
        } else {
          statement_target_qLabel = valueElement.html();
          try {
            const datavalue = entityData.claims[pidTemp][0].mainsnak.datavalue;
            const type = datavalue.type;

            if (type === "time") {
              const time = datavalue.value.time;
              statement_target_qid = '"' + time + '"^^xsd:dateTime';
            } else if (type === "quantity") {
              const amount = datavalue.value.amount;
              statement_target_qid = amount;
            } else {
              statement_target_qLabel = valueElement.text();
              statement_target_qid = '"' + statement_target_qLabel + '"';
            }
          } finally {
            // Another datatype
            statement_target_qid = null;
          }
        }
      }
    }

    return {
      value: statement_target_qid,
      label: statement_target_qLabel,
      $indicatorElement: valueElement.siblings(".wikibase-snakview-indicators"),
    };
  }

  /**
   * Add property-level icons and popups based on property type
   * @param {Object} statementDetails - Details about the statement
   * @param {string} itemQid - Main item Qid
   * @param {string} itemLabel - Main item Label
   */
  function addPropertyLevelFeatures(statementDetails, itemQid, itemLabel) {
    switch (statementDetails.pid) {
      case WIKIBASE_CONFIG.properties.studentsCount:
        createPopupAndAddIcon(
          statementDetails.$propertyElement,
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
          statementDetails.$propertyElement,
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
          statementDetails.$propertyElement,
          WIKIBASE_CONFIG.externalServices.entitree + itemQid + "?0u0=u&0u1=u",
          "🌳",
          "Family tree on Entitree",
        );
        break;
    }
  }

  /**
   * Add value-level icons and popups based on property and value
   * @param {Object} statementDetails - Details about the statement
   * @param {Object} valueDetails - Details about the value
   * @param {string} itemQid - Main item Qid
   * @param {string} itemLabel - Main item label
   */
  function addValueLevelFeatures(
    statementDetails,
    valueDetails,
    itemQid,
    itemLabel,
  ) {
    if (!valueDetails.value) {
      return;
    }

    switch (statementDetails.pid) {
      // Occupation based queries
      case WIKIBASE_CONFIG.properties.occupation:
        switch (valueDetails.value) {
          case WIKIBASE_CONFIG.entities.painter:
            createPopupAndAddIcon(
              valueDetails.$indicatorElement,
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
              valueDetails.$indicatorElement,
              WIKIBASE_CONFIG.externalServices.scholia + itemQid,
              "📚",
              "Page on Scholia",
            );
            break;
        }
        break;

      case WIKIBASE_CONFIG.properties.employer:
        createPopupAndAddIcon(
          valueDetails.$indicatorElement,
          replaceQueryPlaceholders(WIKIBASE_CONFIG.queryTemplates.employer, {
            targetEntityQid: valueDetails.statement_target_qid,
          }),
          "👥",
          "Other employees of this organization as graph",
          "100 other employees of " + valueDetails.statement_target_qLabel,
        );
        break;
    }
  }

  /**
   * Process all statement values for a given statement
   * @param {Object} statementDetails - Details about the statement
   * @param {Object} entityData - Main entity data
   * @param {string} itemLabel - Label
   */
  function processStatementValues(statementDetails, entityData, itemLabel) {
    // This iterates over each valuebox for a statement (contains all the qualifiers and their value)
    statementDetails.$statementElement
      .find(".wikibase-statementview-mainsnak-container")
      .each(function () {
        // We ignore qualifiers for now and focus on the mainsnak
        const $valueElement = $(this).find(".wikibase-statementview-mainsnak");

        // Extract property details for this specific value
        /*let pidTemp;
        const pElement = $valueElement
          .parents(".wikibase-snakview")
          .find(".wikibase-snakview-property")
          .find("a");

        if (pElement.length) {
          pidTemp = pElement.attr("title").split(":")[1];
          console.log("Element length 1")
        } else {
          pidTemp = statementDetails.pid;
        }*/

        // Extract value details
        const valueDetails = extractValueDetails(
          $valueElement,
          entityData,
          statementDetails.pid,
        );

        // Add value-level features
        addValueLevelFeatures(
          statementDetails,
          valueDetails,
          entityData.id,
          itemLabel,
        );
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

      // Create entity graph popup
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

      $(".wikibase-statementgroupview").each(function () {
        // Iterates over all statements
        const $statementElement = $(this);

        // Extract statement details
        const statementDetails = extractStatementDetails($statementElement);

        // Add property-level features
        addPropertyLevelFeatures(statementDetails, entityData.id, itemLabel);

        // Process statement values
        processStatementValues(statementDetails, entityData, itemLabel);
      });
    });
  }

  // Initialize the main processing
  processWikibaseEntityPage();
});
