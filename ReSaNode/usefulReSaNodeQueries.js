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
    queryServiceUrl: "https://resanode.wikibase.cloud/query/",
    queryEmbedUrl: "https://resanode.wikibase.cloud/query/embed.html",
    enableQLever: false,
    qleverUrl: "https://qlever.cs.uni-freiburg.de/wikidata/",
    allowedNamespace: 120,
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
      id: "artworkLocationsMap",
      scope: "property",
      propertyId: ["P17"],
      template: `PREFIX rst: <https://resanode.wikibase.cloud/prop/direct/>
PREFIX rs: <https://resanode.wikibase.cloud/entity/>
#defaultView:Map
SELECT ?work ?workLabel ?coordinate WHERE {
  rs:{itemQid} rst:P17 ?work.
  ?work rst:P7 ?coordinate.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],de". }
}`,
      emoji: "📍",
      title: "Lokalisierung der Kunstwerke von {itemLabel}",
    },
    {
      id: "personNetwork",
      scope: "property",
      propertyId: ["P35"],
      template: `PREFIX rs: <https://resanode.wikibase.cloud/entity/>
PREFIX rst: <https://resanode.wikibase.cloud/prop/direct/>

#defaultView:Graph

SELECT ?person ?personLabel ?event ?eventLabel ?fieldofwork ?fieldofworkLabel WHERE {
  rs:{itemQid} rst:P35 ?event.
  ?event rst:P38 ?person.
  OPTIONAL {
    ?person ( rst:P14 | rst:P29 ) ?fieldofwork.
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],de". }
}`,
      emoji: "🕸️",
      title: "Personennetzwerk von {itemLabel} über Ereignisse",
    },
  ];

  // ===== USEFUL LINKS CONFIGURATION =====
  // Add new external links here - they will automatically be attached to the right places

  /** @type {UsefulLink[]} */
  const USEFUL_LINKS = [

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
 */
function createQueryPopup(
  element,
  querystring,
  buttonLabel,
  title,
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

    const widthWithMin = Math.min(Math.max(window.innerWidth - 40, 400), 800);
    const embedHref = SETTINGS.queryEmbedUrl + querystring;
    const qleverHref = null;

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
            placement="bottom"
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
