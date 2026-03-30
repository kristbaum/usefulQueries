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
