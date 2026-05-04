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
