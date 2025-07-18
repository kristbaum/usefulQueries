/*
 * This script provides context-based queries to statements for Wikimedia pages.
 * It creates a popup when you click on certain elements, showing data from Wikidata.
 *
 * To activate this script, add the line below to your common.js on MediaWiki:
 * mw.loader.load("//www.wikidata.org/w/index.php?title=User:Kristbaum/usefulQueries.js&action=raw&ctype=text/javascript");
 * The source code in readable form can be found here https://github.com/kristbaum/usefulQueries/
 *
 * License: CC0
 */
$(function () {
  "use strict";

  // ===== WIKIBASE CONFIGURATION =====
  // Configure these values for your specific Wikibase instance
  const WIKIBASE_CONFIG = {
    // Base URLs - change these for your Wikibase instance
    queryServiceUrl: "https://query.wikidata.org/",
    queryEmbedUrl: "https://query.wikidata.org/embed.html",
    entityPrefix: "wd:",
    propertyPrefix: "wdt:",

    // Property mappings - update these IDs for your Wikibase
    properties: {
      studentsCount: "P2196",        // students count
      membersCount: "P2124",         // members count
      father: "P22",                 // father
      mother: "P25",                 // mother
      sibling: "P3373",              // sibling
      spouse: "P26",                 // spouse
      occupation: "P106",            // occupation
      employer: "P108",              // employer
      creator: "P170",               // creator
      image: "P18",                  // image
      logo: "P154",                  // logo
      pointInTime: "P585"            // point in time
    },

    // Entity mappings - update these IDs for your Wikibase
    entities: {
      painter: "Q1028181",           // painter
      researcher: "Q1650915"         // researcher
    },

    // External service URLs
    externalServices: {
      entitree: "https://www.entitree.com/en/family_tree/",
      scholia: "https://scholia.toolforge.org/author/"
    }
  };

  // Exit the script if we're not in the main namespace (article namespace).
  if (mw.config.get("wgNamespaceNumber") !== 0) {
    return;
  }

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
    result = result.replace(/{propertyPrefix}/g, WIKIBASE_CONFIG.propertyPrefix);

    // Replace property placeholders
    Object.entries(WIKIBASE_CONFIG.properties).forEach(([key, value]) => {
      const placeholder = `{${key}}`;
      result = result.replace(new RegExp(placeholder, 'g'), value);
    });

    // Replace entity placeholders
    Object.entries(WIKIBASE_CONFIG.entities).forEach(([key, value]) => {
      const placeholder = `{${key}}`;
      result = result.replace(new RegExp(placeholder, 'g'), value);
    });

    // Replace custom replacements
    Object.entries(replacements).forEach(([key, value]) => {
      const placeholder = `{${key}}`;
      result = result.replace(new RegExp(placeholder, 'g'), value);
    });

    return result;
  }

  /**
   * Convert a human-readable SPARQL query to URL-encoded format
   * @param {string} sparqlQuery - The human-readable SPARQL query
   * @returns {string} URL-encoded query string
   */
  function encodeQueryForURL(sparqlQuery) {
    // First encode the query, then add the # prefix for the query service
    return "#" + encodeURIComponent(sparqlQuery);
  }

  function createIconWithLink(element, url, icon, toolhint) {
    mw.loader
      .using([
        "oojs-ui-core",
        "oojs-ui-widgets",
        "oojs-ui.styles.icons-content",
      ])
      .then(function () {
        // Create the icon that will trigger the popup.
        let queryIcon = new OO.ui.ButtonWidget({
          framed: false,
          icon: icon,
          label: "Edit",
          invisibleLabel: true,
          title: toolhint,
          href: url,
          target: "_blank",
        });

        // Add the icon and the popup to the specified element.
        $(element).append(queryIcon.$element);
      });
  }

  // Function to create a popup and add an icon to the specified element.
  function createPopupAndAddIcon(
    element,
    querystring,
    icon,
    toolhint,
    toplabel
  ) {
    mw.loader
      .using([
        "oojs-ui-core",
        "oojs-ui-widgets",
        "oojs-ui.styles.icons-interactions",
      ])
      .then(function () {
        // Create the icon that will trigger the popup.
        let queryIcon = new OO.ui.IconWidget({
          icon: icon,
          iconTitle: toolhint,
          title: toolhint,
          $element: $("<a>").attr({
            href: WIKIBASE_CONFIG.queryServiceUrl + querystring,
            target: "_blank",
            style: "background-size: 20px 20px; opacity: 0.5;",
          }),
        });

        let width_with_min = window.screen.width / 3;
        if (width_with_min < 500) {
          width_with_min = 500;
        }

        // Create the popup widget.
        let $content = $("<div>");
        let popup = new OO.ui.PopupWidget({
          $content: $content,
          width: width_with_min,
          head: true,
          padded: false,
          label: toplabel,
          align: "force-right",
        });

        // Close the popup when the ESC key is pressed.
        $(document).keydown(function (e) {
          if (e.keyCode === 27) {
            // ESCAPE key
            popup.onCloseButtonClick();
          }
        });

        // When the icon is clicked, populate the popup with the iframe content and show it.
        queryIcon.$element.click(function () {
          $content.html(
            $('<iframe scrolling="yes" frameborder="0">').attr({
              src: WIKIBASE_CONFIG.queryEmbedUrl + querystring,
              width: width_with_min,
              height: width_with_min,
            })
          );
          popup.$element.attr("style", "position:absolute; z-index:100;");
          popup.toggle(true);
          return false; // Prevent the default action (like navigating to a link).
        });

        // Add the icon and the popup to the specified element.
        $(element).append(queryIcon.$element, popup.$element);
      });
  }


  /**
   * Extract basic entity information from the page
   * @returns {Object} Entity details including QID and label
   */
  function extractEntityDetails() {
    const $title = $(".wikibase-title").first();
    const qid = $title.find(".wikibase-title-id").text().replace(/[()]/g, "");
    const label = $title.find(".wikibase-title-label").text();

    return {
      qid: qid,
      label: label,
      $titleElement: $title
    };
  }

  /**
   * Extract property and value information from a statement element
   * @param {jQuery} statementElement - The statement element to process
   * @param {Object} entityData - The full entity data from Wikibase
   * @returns {Object} Property and value details
   */
  function extractStatementDetails(statementElement, entityData) {
    const statement_pid = statementElement.attr('id');
    const statement_pLabel = statementElement
      .find(".wikibase-statementgroupview-property-label")
      .text();

    const statement_p_element = statementElement
      .find(".wikibase-statementgroupview-property-label");
    return {
      pid: statement_pid,
      pLabel: statement_pLabel,
      $propertyElement: statement_p_element,
      $statementElement: statementElement
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
          } catch (e) {
            console.warn("Could not extract datavalue type:", e);
            statement_target_qid = null;
          }
        }
      }
    }

    const valueDetails = {
      qid: statement_target_qid,
      label: statement_target_qLabel,
      $indicatorElement: valueElement.siblings(".wikibase-snakview-indicators")
    };
    return valueDetails;
  }

  /**
   * Add property-level icons and popups based on property type
   * @param {Object} statementDetails - Details about the statement
   * @param {Object} entityDetails - Details about the main entity
   */
  function addPropertyLevelFeatures(statementDetails, entityDetails) {
    const { pid, $propertyElement } = statementDetails;
    const { qid: main_qid, label: main_qlabel } = entityDetails;
    const config = WIKIBASE_CONFIG;

    switch (pid) {
      case config.properties.studentsCount:
        const studentsQueryTemplate = `#defaultView:LineChart
SELECT ?pit ?s_count WHERE {
  {entityPrefix}{entityQid} p:{studentsCount} ?statement.
  ?statement ps:{studentsCount} ?s_count.
  OPTIONAL { ?statement pq:{pointInTime} ?pit. }
}`;

        const studentsQuery = replaceQueryPlaceholders(studentsQueryTemplate, {
          entityQid: main_qid
        });
        const studentsQuerystring = encodeQueryForURL(studentsQuery);

        createPopupAndAddIcon(
          $propertyElement,
          studentsQuerystring,
          "ellipsis",
          "Students count over time",
          'Students count of "' + main_qlabel + '" over time:'
        );
        break;

      case config.properties.membersCount:
        const membersQueryTemplate = `#defaultView:LineChart
SELECT ?pit ?s_count WHERE {
  {entityPrefix}{entityQid} p:{membersCount} ?statement.
  ?statement ps:{membersCount} ?s_count.
  OPTIONAL { ?statement pq:{pointInTime} ?pit. }
}`;

        const membersQuery = replaceQueryPlaceholders(membersQueryTemplate, {
          entityQid: main_qid
        });
        const membersQuerystring = encodeQueryForURL(membersQuery);

        createPopupAndAddIcon(
          $propertyElement,
          membersQuerystring,
          "ellipsis",
          "Members count over time",
          "Members count of " + main_qlabel + " over time:"
        );
        break;

      case config.properties.father:
      case config.properties.mother:
      case config.properties.sibling:
      case config.properties.spouse:
        createIconWithLink(
          $propertyElement,
          config.externalServices.entitree + main_qid + "?0u0=u&0u1=u",
          "articleDisambiguation",
          "Familytree on Entitree"
        );
        break;
    }
  }

  /**
   * Add value-level icons and popups based on property and value
   * @param {Object} statementDetails - Details about the statement
   * @param {Object} valueDetails - Details about the value
   * @param {Object} entityDetails - Details about the main entity
   */
  function addValueLevelFeatures(statementDetails, valueDetails, entityDetails) {
    const { pid } = statementDetails;
    const { qid: statement_target_qid, label: statement_target_qLabel, $indicatorElement } = valueDetails;
    const { qid: main_qid, label: main_qlabel } = entityDetails;
    const config = WIKIBASE_CONFIG;

    if (!statement_target_qid) {
      return;
    }

    switch (pid) {
      case config.properties.occupation:
        switch (statement_target_qid) {
          case config.entities.painter:
            const artworksQueryTemplate = `#defaultView:ImageGrid
SELECT ?item ?creator ?creatorLabel ?image WHERE {
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". }
  ?item {propertyPrefix}{creator} {entityPrefix}{entityQid}.
  OPTIONAL { ?item {propertyPrefix}{image} ?image. }
}
LIMIT 100`;

            const artworksQuery = replaceQueryPlaceholders(artworksQueryTemplate, {
              entityQid: main_qid
            });
            const artworksQuerystring = encodeQueryForURL(artworksQuery);

            createPopupAndAddIcon(
              $indicatorElement,
              artworksQuerystring,
              "ellipsis",
              "Artworks by this painter in Wikimedia Commons",
              "Artworks by " + main_qlabel
            );
            break;

          case config.entities.researcher:
            createIconWithLink(
              $indicatorElement,
              config.externalServices.scholia + main_qid,
              "articleSearch",
              "Page on Scholia"
            );
            break;
        }
        break;

      case config.properties.employer:
        const employerQueryTemplate = `#defaultView:Graph
SELECT DISTINCT ?employee ?employeeLabel ?imageEmp ?org ?orgLabel ?imageOrg WHERE {
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". }
  VALUES ?org {
    {entityPrefix}{targetEntityQid}
  }
  ?employee {propertyPrefix}{employer} ?org.
  OPTIONAL { ?employee {propertyPrefix}{image} ?imageEmp. }
  OPTIONAL { ?org {propertyPrefix}{logo} ?imageOrg. }
}
LIMIT 100`;

        const employerQuery = replaceQueryPlaceholders(employerQueryTemplate, {
          targetEntityQid: statement_target_qid
        });
        const employerQuerystring = encodeQueryForURL(employerQuery);

        createPopupAndAddIcon(
          $indicatorElement,
          employerQuerystring,
          "ellipsis",
          "Other employees of this organization as graph",
          "100 other employees of " + statement_target_qLabel
        );
        break;
    }
  }

  /**
   * Process all statement values for a given statement
   * @param {Object} statementDetails - Details about the statement
   * @param {Object} entityDetails - Details about the main entity
   * @param {Object} entityData - The full entity data from Wikibase
   */
  function processStatementValues(statementDetails, entityDetails, entityData) {
    const { pid, $statementElement } = statementDetails;

    $statementElement
      .find(".wikibase-statementview-mainsnak-container")
      .find(".wikibase-snakview-value")
      .each(function () {
        const $valueElement = $(this);

        // Extract property details for this specific value
        let pidTemp;
        let pLabelTemp;
        const pElement = $valueElement
          .parents(".wikibase-snakview")
          .find(".wikibase-snakview-property")
          .find("a");

        if (pElement.length) {
          pidTemp = pElement.attr("title").split(":")[1];
          pLabelTemp = pElement.text();
        } else {
          pidTemp = pid;
          pLabelTemp = statementDetails.pLabel;
        }

        // Extract value details
        const valueDetails = extractValueDetails($valueElement, entityData, pidTemp);

        // Add value-level features
        addValueLevelFeatures(statementDetails, valueDetails, entityDetails);
      });
  }

  /**
   * Create entity graph popup for the main entity
   * @param {Object} entityDetails - Details about the main entity
   */
  function createEntityGraphPopup(entityDetails) {
    const { qid, label, $titleElement } = entityDetails;

    const entityGraphQueryTemplate = `#defaultView:Graph
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
}`;

    const entityGraphQuery = replaceQueryPlaceholders(entityGraphQueryTemplate, {
      entityQid: qid,
      userLanguage: mw.config.get("wgUserLanguage")
    });
    const querystring = encodeQueryForURL(entityGraphQuery);

    createPopupAndAddIcon(
      $titleElement.find(".wikibase-title-id"),
      querystring,
      "ellipsis",
      "Click to see entity graph",
      "Entity Graph of " + label
    );
  }

  /**
   * Main function to orchestrate the processing of the Wikibase entity page
   */
  function processWikibaseEntityPage() {
    console.log("Starting Wikibase entity page processing...");

    // Step 1: Extract entity details
    const entityDetails = extractEntityDetails();
    if (!entityDetails.qid) {
      console.warn("Could not extract entity QID, aborting");
      return;
    }

    // Step 2: Create entity graph popup
    createEntityGraphPopup(entityDetails);

    // Step 3: Process statements when entity data is loaded
    mw.hook("wikibase.entityPage.entityLoaded").add(function (entityData) {

      $(".wikibase-statementgroupview").each(function () {
        const $statementElement = $(this);

        // Step 4: Extract statement details
        const statementDetails = extractStatementDetails($statementElement, entityData);

        // Step 5: Add property-level features
        addPropertyLevelFeatures(statementDetails, entityDetails);

        // Step 6: Process statement values
        processStatementValues(statementDetails, entityDetails, entityData);
      });

    });

    console.log("Wikibase entity page processing setup complete");
  }

  // Initialize the main processing
  processWikibaseEntityPage();
});
