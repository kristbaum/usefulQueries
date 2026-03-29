// ===== PROCESSING FUNCTIONS =====

/**
 * Check if a property ID matches a query/link configuration
 * @param {string} propertyId - The property ID to check
 * @param {string|string[]} configPropertyId - The configured property ID(s)
 * @returns {boolean} True if matches
 */
function matchesPropertyId(propertyId, configPropertyId) {
  return configPropertyId.includes(propertyId);
}

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
      matchesValueId(valueDetails.value, q.valueId),
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
      matchesValueId(valueDetails.value, l.valueId),
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
