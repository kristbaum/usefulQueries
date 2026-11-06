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
 * Element next to which entity-level buttons go.
 * Desktop: the "(Q42)" after the label. Mobile (wbui2025): the primary label,
 * which is an <h2> when the item has a label and a <div> ("No label defined")
 * when it has none. The page heading is the last resort, so the buttons never
 * end up in a detached element.
 * @returns {jQuery} Possibly empty if the page has none of these
 */
function getTitleElement() {
  for (const selector of [
    ".wikibase-title .wikibase-title-id",
    ".wb-ui-label--primary",
    "#firstHeading",
  ]) {
    const $el = $(selector).first();
    if ($el.length) return $el;
  }
  return $();
}

/**
 * The item's label for {itemLabel}, from the entity data rather than the page
 * (which shows "No label defined" when there is none). Follows the user's
 * language fallback chain, then "mul", then any label; falls back to the ID.
 * @param {Object} entityData - From wikibase.entityPage.entityLoaded
 * @param {string} userLanguage
 * @returns {string}
 */
function getItemLabel(entityData, userLanguage) {
  const labels = entityData.labels || {};
  const chain =
    mw.language && mw.language.getFallbackLanguageChain
      ? mw.language.getFallbackLanguageChain()
      : [userLanguage, "en"];
  for (const lang of [userLanguage, ...chain, "mul"]) {
    if (labels[lang] && labels[lang].value) return labels[lang].value;
  }
  const any = Object.values(labels).find((l) => l && l.value);
  return any ? any.value : entityData.id;
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

// --- Qualifiers and references ---
// Desktop renders each snak as .wikibase-snakview-<hash>; the property label is
// only filled on the first snak of each property. Mobile (wbui2025) renders
// qualifiers as .wikibase-wbui2025-qualifier rows whose value carries
// data-snak-hash. Mobile references are only rendered once expanded, so they
// get no buttons there.

/**
 * The element holding a statement's qualifiers.
 * @param {jQuery} $statementElement
 * @returns {jQuery|null}
 */
function getQualifiersElement($statementElement) {
  const $el = $statementElement
    .find(".wikibase-statementview-qualifiers, .wikibase-wbui2025-qualifiers")
    .first();
  return $el.length ? $el : null;
}

/**
 * The element of one reference of a statement (desktop only).
 * @param {jQuery} $statementElement
 * @param {string} hash - The reference hash from the entity data
 * @returns {jQuery|null}
 */
function getReferenceElement($statementElement, hash) {
  const $el = $statementElement.find(".wikibase-referenceview-" + hash).first();
  return $el.length ? $el : null;
}

/**
 * One qualifier or reference snak inside its container.
 * @param {jQuery} $container - From getQualifiersElement / getReferenceElement
 * @param {string} hash - The snak hash from the entity data
 * @returns {jQuery|null}
 */
function getSnakElement($container, hash) {
  let $el = $container.find(".wikibase-snakview-" + hash).first();
  if (!$el.length) $el = $container.find('[data-snak-hash="' + hash + '"]').first();
  return $el.length ? $el : null;
}

/**
 * The property label shown for a snak (pass the first snak of a property).
 * @param {jQuery} $container
 * @param {string} hash
 * @returns {jQuery|null}
 */
function getSnakPropertyElement($container, hash) {
  const $snak = getSnakElement($container, hash);
  if (!$snak) return null;
  // Desktop
  let $el = $snak.find(".wikibase-snakview-property").first();
  // Mobile
  if (!$el.length) {
    $el = $snak.closest(".wikibase-wbui2025-qualifier").find(".wikibase-wbui2025-property-name").first();
  }
  return $el.length ? $el : null;
}

/**
 * Where value buttons go on a qualifier/reference snak.
 * @param {jQuery} $snak - From getSnakElement
 * @returns {jQuery}
 */
function getSnakIndicatorElement($snak) {
  const $desktop = $snak.find(".wikibase-snakview-indicators").first();
  return $desktop.length ? $desktop : $snak;
}

/**
 * Displayed label of a qualifier/reference value.
 * @param {jQuery} $snak
 * @returns {string|null}
 */
function getSnakValueLabel($snak) {
  const $a = $snak.find(".wikibase-snakview-value a, .snakValue a").first();
  return $a.length ? $a.text().trim() || null : null;
}

/**
 * Extract value details from a claim's mainsnak
 * @param {Object} mainsnak - The mainsnak object from the claim
 * @returns {{value: string|null, label: string|null, entityId?: string, latitude?: string, longitude?: string}} Value details
 *   (`value` is the raw form used to match valueId: Q64 for items, the SPARQL term otherwise)
 */
function extractValueFromMainsnak(mainsnak) {
  if (!mainsnak || mainsnak.snaktype !== "value" || !mainsnak.datavalue) {
    return { value: null, label: null };
  }

  const datavalue = mainsnak.datavalue;

  switch (datavalue.type) {
    case "wikibase-entityid":
      return { value: datavalue.value.id, label: null, entityId: datavalue.value.id };
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
