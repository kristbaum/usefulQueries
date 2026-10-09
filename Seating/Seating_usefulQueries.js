/*
 * usefulQueries: adds buttons to Wikibase item pages that run SPARQL queries
 * or open external tools relevant to the item's statements.
 *
 * Documentation: https://www.wikidata.org/wiki/User:Kristbaum/usefulQueries
 *
 * License of this file: CC0
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
      id: "coParticipantGraph",
      scope: "value",
      propertyId: ["P710"],
      valueId: null,
      template: `#defaultView:Graph
# Where else did this participant meet people: the other events they are
# recorded at, each one surrounded by its own attendees. Two levels out of
# one row set - level 1 links the person to the event, level 2 the event to
# its other participants - which keeps the graph connected without a UNION
# of BIND-only arms (Blazegraph leaves ?event unbound in those, and the
# image OPTIONALs below then scan every P18 in the store).
SELECT DISTINCT ?node ?nodeLabel ?nodeImage ?childNode ?childNodeLabel ?childNodeImage WHERE {
  {
    SELECT DISTINCT ?event ?other WHERE {
      ?event wdt:P710 wd:{valueQid}.
      ?event wdt:P710 ?other.
      FILTER(?other != wd:{valueQid})
      # Participants recorded as unknown value are blank nodes with no label.
      FILTER(STRSTARTS(STR(?other), "http://www.wikidata.org/entity/Q"))
    }
    LIMIT 300
  }
  VALUES ?level { 1 2 }
  BIND(IF(?level = 1, wd:{valueQid}, ?event) AS ?node)
  BIND(IF(?level = 1, ?event, ?other) AS ?childNode)
  OPTIONAL { ?node wdt:P18 ?nodeImage. }
  OPTIONAL { ?childNode wdt:P18 ?childNodeImage. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],mul,en". }
}`,
      emoji: "🕸️",
      title: "Who {valueLabel} met at other events",
    },
    {
      id: "participantEvents",
      scope: "value",
      propertyId: ["P710"],
      valueId: null,
      template: `#defaultView:Timeline
# When this participant appears: every event they are recorded at, on a
# timeline, grouped by the role they appeared in - bride, bridegroom,
# mourner. The role variable is called ?edge because the Timeline view
# groups by ?edgeLabel, and the label service only fills a label variable
# that the SELECT projects by name.
SELECT DISTINCT ?event ?eventLabel ?date ?image ?edgeLabel WHERE {
  ?event p:P710 ?statement.
  ?statement ps:P710 wd:{valueQid}.
  # Ceremonies carry a point in time, longer events a start time.
  OPTIONAL { ?event wdt:P585 ?pointInTime. }
  OPTIONAL { ?event wdt:P580 ?startTime. }
  BIND(COALESCE(?pointInTime, ?startTime) AS ?date)
  FILTER(BOUND(?date))
  OPTIONAL { ?statement pq:P3831 ?edge. }
  OPTIONAL { ?event wdt:P18 ?image. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],mul,en". }
}
ORDER BY ?date
LIMIT 300`,
      emoji: "📆",
      title: "Events {valueLabel} took part in, over time",
    },
    {
      id: "seatingChain",
      scope: "value",
      propertyId: ["P31"],
      valueId: ["Q63442071","Q49836","Q209715","Q464122","Q626066","Q7603676","Q201676","Q2627975","Q2324916","Q758824"],
      template: `#defaultView:Graph
# The seating as a chain: every participant is linked to the one holding the
# next series ordinal, so the graph reads along the table. The chain is built
# from the ordinals and not from the "follows" / "followed by" qualifiers:
# where the neighbour is an unknown value those qualifiers are anonymous
# blank nodes and carry no link, while the ordinals cover every guest.
SELECT ?node ?nodeLabel ?nodeImage ?childNode ?childNodeLabel ?childNodeImage WHERE {
  wd:{itemQid} p:P710 ?statement, ?nextStatement.
  ?statement pq:P1545 ?ordinal.
  ?nextStatement pq:P1545 ?nextOrdinal.
  FILTER(xsd:integer(?nextOrdinal) = xsd:integer(?ordinal) + 1)
  ?statement ps:P710 ?value.
  ?nextStatement ps:P710 ?nextValue.
  OPTIONAL { ?statement pq:P3831 ?eventRole. }
  OPTIONAL { ?statement pq:P39 ?office. }
  OPTIONAL { ?nextStatement pq:P3831 ?nextEventRole. }
  OPTIONAL { ?nextStatement pq:P39 ?nextOffice. }
  BIND(IF(STRSTARTS(STR(?value), "http://www.wikidata.org/entity/"), ?value, ?unnamed) AS ?person)
  BIND(IF(STRSTARTS(STR(?nextValue), "http://www.wikidata.org/entity/"), ?nextValue, ?unnamed) AS ?nextPerson)
  # A named guest is a node of their own item, an attendant recorded as
  # unknown value a node of their statement - so two chamberlains at the same
  # table stay two seats instead of collapsing into one node.
  BIND(COALESCE(?person, ?statement) AS ?node)
  BIND(COALESCE(?nextPerson, ?nextStatement) AS ?childNode)
  # Look the images up from ?value, which is always bound (an unknown guest
  # is a genid IRI and simply has no P18). On the possibly unbound ?person an
  # OPTIONAL would scan every image in the store instead.
  OPTIONAL { ?value wdt:P18 ?nodeImage. }
  OPTIONAL { ?nextValue wdt:P18 ?childNodeImage. }
  # Labelled by hand rather than by SERVICE wikibase:label: the node label has
  # to carry the seat number, and it falls back to the office where the guest
  # has no name of their own. The statement IRI in the last position of the
  # COALESCE only keeps ?who bound - it has no rdfs:label, so such a node ends
  # up labelled "7. ?".
  BIND(COALESCE(?person, ?eventRole, ?office, ?statement) AS ?who)
  BIND(COALESCE(?nextPerson, ?nextEventRole, ?nextOffice, ?nextStatement) AS ?nextWho)
  OPTIONAL { ?who rdfs:label ?whoName. FILTER(LANG(?whoName) = "{userLanguage}") }
  OPTIONAL { ?who rdfs:label ?whoNameMul. FILTER(LANG(?whoNameMul) = "mul") }
  OPTIONAL { ?who rdfs:label ?whoNameEn. FILTER(LANG(?whoNameEn) = "en") }
  OPTIONAL { ?nextWho rdfs:label ?nextName. FILTER(LANG(?nextName) = "{userLanguage}") }
  OPTIONAL { ?nextWho rdfs:label ?nextNameMul. FILTER(LANG(?nextNameMul) = "mul") }
  OPTIONAL { ?nextWho rdfs:label ?nextNameEn. FILTER(LANG(?nextNameEn) = "en") }
  BIND(CONCAT(?ordinal, ". ", COALESCE(?whoName, ?whoNameMul, ?whoNameEn, "?")) AS ?nodeLabel)
  BIND(CONCAT(?nextOrdinal, ". ", COALESCE(?nextName, ?nextNameMul, ?nextNameEn, "?")) AS ?childNodeLabel)
}
LIMIT 200`,
      emoji: "🍽️",
      title: "Who sat next to whom at {itemLabel}",
    },
    {
      id: "seatingOrder",
      scope: "value",
      propertyId: ["P31"],
      valueId: ["Q63442071","Q49836","Q209715","Q464122","Q626066","Q7603676","Q201676","Q2627975","Q2324916","Q758824"],
      template: `# Who sat where: every participant of the ceremony in the order the
# protocol records them (series ordinal), with the role they appeared in,
# their rank of precedence, and the guests seated before, after and
# opposite them. On a ceremony without seating qualifiers it degrades to
# the plain participant list with whatever roles are recorded.
SELECT ?seat ?rank ?participant ?participantLabel ?roleLabel ?afterLabel ?beforeLabel ?oppositeLabel WHERE {
  wd:{itemQid} p:P710 ?statement.
  ?statement ps:P710 ?value.
  OPTIONAL { ?statement pq:P1545 ?ordinal. }
  OPTIONAL { ?statement pq:P1352 ?ranking. }
  OPTIONAL { ?statement pq:P3831 ?eventRole. }
  OPTIONAL { ?statement pq:P39 ?office. }
  OPTIONAL { ?statement pq:P155 ?afterValue. }
  OPTIONAL { ?statement pq:P156 ?beforeValue. }
  OPTIONAL { ?statement pq:P461 ?oppositeValue. }
  # Attendants known only by their office are modelled as "unknown value",
  # which the store skolemises into a genid IRI. IF() over an unbound
  # variable yields no binding at all, so those cells stay empty instead of
  # showing the genid URI - the role column is what names those people.
  BIND(IF(STRSTARTS(STR(?value), "http://www.wikidata.org/entity/"), ?value, ?unnamed) AS ?participant)
  BIND(IF(STRSTARTS(STR(?afterValue), "http://www.wikidata.org/entity/"), ?afterValue, ?unnamed) AS ?after)
  BIND(IF(STRSTARTS(STR(?beforeValue), "http://www.wikidata.org/entity/"), ?beforeValue, ?unnamed) AS ?before)
  BIND(IF(STRSTARTS(STR(?oppositeValue), "http://www.wikidata.org/entity/"), ?oppositeValue, ?unnamed) AS ?opposite)
  # P3831 carries the role in this event (bride, bridegroom), P39 the office
  # an otherwise unnamed attendant held (chamberlain, envoy).
  BIND(COALESCE(?eventRole, ?office) AS ?role)
  BIND(xsd:integer(?ordinal) AS ?seat)
  BIND(xsd:integer(?ranking) AS ?rank)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],mul,en". }
}
ORDER BY ?seat ?rank
LIMIT 200`,
      emoji: "🪑",
      title: "Seating order at {itemLabel}",
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

  // The property this button hangs off, for templates that query that exact
  // relation instead of hardcoding one.
  const propertyContext = { ...context, propertyPid: propertyId };

  // Process property-level queries
  for (const query of (_templateIndex.queries.byKey.get(propKey) ?? [])) {
    const queryText = replacePlaceholders(query.template, propertyContext);
    const queryString = encodeQueryString(queryText);
    createQueryPopup(
      $propertyElement,
      queryString,
      query.emoji,
      replacePlaceholders(query.title, propertyContext),
      "property",
    );
  }

  // Process property-level links
  for (const link of (_templateIndex.links.byKey.get(propKey) ?? [])) {
    const url = replacePlaceholders(link.urlTemplate, propertyContext);
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
    propertyPid: propertyId,
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
