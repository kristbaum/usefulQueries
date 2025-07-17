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
  // Exit the script if we're not in the main namespace (article namespace).
  if (mw.config.get("wgNamespaceNumber") !== 0) {
    return;
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
            href: "https://query.wikidata.org/" + querystring,
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
              src: "https://query.wikidata.org/embed.html" + querystring,
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
    const $title = $(".wikibase-title");
    const qid = $title.find(".wikibase-title-id").text().replace(/[()]/g, "");
    const label = $title.find(".wikibase-title-label").text();
    
    console.log("Extracted entity details:", { qid, label });
    
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

    console.log("Processing statement:", { statement_pid, statement_pLabel });

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

    console.log("Extracted value details:", valueDetails);
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

    switch (pid) {
      case "P2196": //students count
        const studentsQuerystring =
          "#%23defaultView%3ALineChart%0ASELECT%20%3Fpit%20%3Fs_count%20%20WHERE%20%7B%0A%20%20wd%3A" +
          main_qid +
          "%20p%3AP2196%20%3Fstatement.%0A%20%20%3Fstatement%20ps%3AP2196%20%3Fs_count.%0A%20%20OPTIONAL%20%7B%20%3Fstatement%20pq%3AP585%20%3Fpit.%20%7D%0A%7D";
        createPopupAndAddIcon(
          $propertyElement,
          studentsQuerystring,
          "ellipsis",
          "Students count over time",
          'Students count of "' + main_qlabel + '" over time:'
        );
        break;

      case "P2124": //members count
        const membersQuerystring =
          "#%23defaultView%3ALineChart%0ASELECT%20%3Fpit%20%3Fs_count%20%20WHERE%20%7B%0A%20%20wd%3A" +
          main_qid +
          "%20p%3AP2124%20%3Fstatement.%0A%20%20%3Fstatement%20ps%3AP2196%20%3Fs_count.%0A%20%20OPTIONAL%20%7B%20%3Fstatement%20pq%3AP585%20%3Fpit.%20%7D%0A%7D";
        createPopupAndAddIcon(
          $propertyElement,
          membersQuerystring,
          "ellipsis",
          "Members count over time",
          "Members count of " + main_qlabel + " over time:"
        );
        break;

      case "P22": //father
      case "P25": //mother
      case "P3373": //sibling
      case "P26": //spouse
        createIconWithLink(
          $propertyElement,
          "https://www.entitree.com/en/family_tree/" +
            main_qid +
            "?0u0=u&0u1=u",
          "articleDisambiguation",
          "Familytree on Entitree"
        );
        break;
    }

    console.log("Added property-level features for:", pid);
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

    if (!statement_target_qid) {
      console.log("No target QID, skipping value-level features");
      return;
    }

    switch (pid) {
      case "P106": //occupation
        switch (statement_target_qid) {
          case "Q1028181": // painter
            const artworksQuerystring =
              "#%23defaultView%3AImageGrid%0ASELECT%20%3Fitem%20%3Fcreator%20%3FcreatorLabel%20%3Fimage%20WHERE%20%7B%0A%20%20SERVICE%20wikibase%3Alabel%20%7B%20bd%3AserviceParam%20wikibase%3Alanguage%20%22%5BAUTO_LANGUAGE%5D%2Cen%22.%20%7D%0A%20%20%3Fitem%20wdt%3AP170%20wd%3A" +
              main_qid +
              ".%0A%20%20OPTIONAL%20%7B%20%3Fitem%20wdt%3AP18%20%3Fimage.%20%7D%0A%7D%0ALIMIT%20100";
            createPopupAndAddIcon(
              $indicatorElement,
              artworksQuerystring,
              "ellipsis",
              "Artworks by this painter in Wikimedia Commons",
              "Artworks by " + main_qlabel
            );
            break;

          case "Q1650915": //researcher
            createIconWithLink(
              $indicatorElement,
              "https://scholia.toolforge.org/author/" + main_qid,
              "articleSearch",
              "Page on Scholia"
            );
            break;
        }
        break;

      case "P108": //employer
        const employerQuerystring =
          "#%23defaultView%3AGraph%0ASELECT%20DISTINCT%20%3Femployee%20%3FemployeeLabel%20%3FimageEmp%20%3Forg%20%3ForgLabel%20%3FimageOrg%20WHERE%20%7B%0A%20%20SERVICE%20wikibase%3Alabel%20%7B%20bd%3AserviceParam%20wikibase%3Alanguage%20%22%5BAUTO_LANGUAGE%5D%2Cen%22.%20%7D%0A%20%20VALUES%20%3Forg%20%7B%0A%20%20%20%20wd%3A" +
          statement_target_qid +
          "%0A%20%20%7D%0A%20%20%3Femployee%20wdt%3AP108%20%3Forg.%0A%20%20OPTIONAL%20%7B%20%3Femployee%20wdt%3AP18%20%3FimageEmp.%20%7D%0A%20%20OPTIONAL%20%7B%20%3Forg%20wdt%3AP154%20%3FimageOrg.%20%7D%0A%7D%0ALIMIT%20100";
        createPopupAndAddIcon(
          $indicatorElement,
          employerQuerystring,
          "ellipsis",
          "Other employees of this organization as graph",
          "100 other employees of " + statement_target_qLabel
        );
        break;
    }

    console.log("Added value-level features for:", pid, statement_target_qid);
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

    console.log("Processed all values for statement:", pid);
  }

  /**
   * Create entity graph popup for the main entity
   * @param {Object} entityDetails - Details about the main entity
   */
  function createEntityGraphPopup(entityDetails) {
    const { qid, label, $titleElement } = entityDetails;
    
    const querystring =
      "#%23defaultView%3AGraph%0ASELECT%20%3Fnode%20%3FnodeLabel%20%3FnodeImage%20%3FchildNode%20%3FchildNodeLabel%20%3FchildNodeImage%20%3Frgb%20WHERE%20%7B%0A%20%20%7B%0A%20%20%20%20BIND%28wd%3A" +
      qid +
      "%20AS%20%3Fnode%29%0A%20%20%20%20%3Fnode%20%3Fp%20%3Fi.%0A%20%20%20%20OPTIONAL%20%7B%20%3Fnode%20wdt%3AP18%20%3FnodeImage.%20%7D%0A%20%20%20%20%3FchildNode%20%3Fx%20%3Fp.%0A%20%20%20%20%3FchildNode%20rdf%3Atype%20wikibase%3AProperty.%0A%20%20%20%20FILTER%28STRSTARTS%28STR%28%3Fi%29%2C%20%22http%3A%2F%2Fwww.wikidata.org%2Fentity%2FQ%22%29%29%0A%20%20%20%20FILTER%28STRSTARTS%28STR%28%3FchildNode%29%2C%20%22http%3A%2F%2Fwww.wikidata.org%2Fentity%2FP%22%29%29%0A%20%20%7D%0A%20%20UNION%0A%20%20%7B%0A%20%20%20%20BIND%28%22EFFBD8%22%20AS%20%3Frgb%29%0A%20%20%20%20wd%3A" +
      qid +
      "%20%3Fp%20%3FchildNode.%0A%20%20%20%20OPTIONAL%20%7B%20%3FchildNode%20wdt%3AP18%20%3FchildNodeImage.%20%7D%0A%20%20%20%20%3Fnode%20%3Fx%20%3Fp.%0A%20%20%20%20%3Fnode%20rdf%3Atype%20wikibase%3AProperty.%0A%20%20%20%20FILTER%28STRSTARTS%28STR%28%3FchildNode%29%2C%20%22http%3A%2F%2Fwww.wikidata.org%2Fentity%2FQ%22%29%29%0A%20%20%7D%0A%20%20OPTIONAL%20%7B%0A%20%20%20%20%3Fnode%20wdt%3AP18%20%3FnodeImage.%0A%20%20%20%20%3FchildNode%20wdt%3AP18%20%3FchildNodeImage.%0A%20%20%7D%0A%20%20SERVICE%20wikibase%3Alabel%20%7B%20bd%3AserviceParam%20wikibase%3Alanguage%20%22" +
      mw.config.get("wgUserLanguage") +
      "%22.%20%7D%0A%7D";
    
    createPopupAndAddIcon(
      $titleElement.find(".wikibase-title-id"),
      querystring,
      "ellipsis",
      "Click to see entity graph",
      "Entity Graph of " + label
    );

    console.log("Created entity graph popup for:", qid);
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
      console.log("Entity data loaded, processing statements...");
      
      $(".wikibase-statementgroupview").each(function () {
        const $statementElement = $(this);
        
        // Step 4: Extract statement details
        const statementDetails = extractStatementDetails($statementElement, entityData);
        
        // Step 5: Add property-level features
        addPropertyLevelFeatures(statementDetails, entityDetails);
        
        // Step 6: Process statement values
        processStatementValues(statementDetails, entityDetails, entityData);
      });

      console.log("Finished processing all statements");
    });

    console.log("Wikibase entity page processing setup complete");
  }

  // Initialize the main processing
  processWikibaseEntityPage();
});
