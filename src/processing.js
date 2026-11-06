// ===== PROCESSING FUNCTIONS =====

// Where on a statement a template hangs: the statement's own (main) value, one
// of its qualifiers, or a snak inside one of its references (SECTIONS, from
// validate-templates.mjs).

/** The section of a template; templates without one are on the statement. */
function sectionOf(template) {
  return template.section || "statement";
}

// Pre-built lookup indexes — avoids full-array scans on every property/claim.
// Keys are "<scope>:<section>:<propertyId>". Rebuilt by setActiveTemplates()
// once the user's config is known, and again whenever it changes.
function buildTemplateIndex(templates) {
  const entity = [];
  const byKey = new Map();
  const sections = new Set();
  for (const t of templates) {
    if (t.scope === "entity") {
      entity.push(t);
    } else {
      sections.add(sectionOf(t));
      const ids = Array.isArray(t.propertyId) ? t.propertyId : [t.propertyId];
      for (const id of ids) {
        const key = templateKey(t.scope, sectionOf(t), id);
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(t);
      }
    }
  }
  return { entity, byKey, sections };
}

function templateKey(scope, section, propertyId) {
  return scope + ":" + section + ":" + propertyId;
}

let _templateIndex = {
  queries: buildTemplateIndex(USEFUL_QUERIES),
  links: buildTemplateIndex(USEFUL_LINKS),
};

/**
 * Replace the active templates (built-ins minus hidden ones, plus the user's).
 * @param {Object[]} queries - Query templates in runtime form
 * @param {Object[]} links - Link templates
 */
function setActiveTemplates(queries, links) {
  _templateIndex = {
    queries: buildTemplateIndex(queries),
    links: buildTemplateIndex(links),
  };
}

/** Whether any active template hangs at scope/section/propertyId. */
function hasTemplates(scope, section, propertyId) {
  const key = templateKey(scope, section, propertyId);
  return _templateIndex.queries.byKey.has(key) || _templateIndex.links.byKey.has(key);
}

/** Whether any active template hangs inside qualifiers or references. */
function hasSectionTemplates(section) {
  return _templateIndex.queries.sections.has(section) || _templateIndex.links.sections.has(section);
}

// In edit mode every anchor also gets a "+" button, and every button an
// edit/hide control. Toggled from the Tools menu.
let _editMode = false;

/**
 * Placeholder values for a button on one value (a statement's main value, a
 * qualifier value or a reference value).
 * @param {Object} context - Placeholders known so far (item, and for
 *   qualifiers/references the statement ones)
 * @param {string} propertyId - The property of this value
 * @param {{value: string, label: ?string, entityId?: string, latitude?: string, longitude?: string}} valueDetails
 * @returns {Object} All placeholders available on scope "value"
 */
function valuePlaceholders(context, propertyId, valueDetails) {
  return {
    ...context,
    propertyId,
    // Bare ID for item/property values (write wd:{valueId}); empty otherwise.
    valueId: valueDetails.entityId || "",
    // Any datatype, already written as a SPARQL term (wd:Q64, "91E23", …).
    valueSparql: sparqlTerm(valueDetails),
    valueLabel: valueDetails.label || valueDetails.value || "",
    // Only set for globe-coordinate values (e.g. P625); empty elsewhere.
    valueLatitude: valueDetails.latitude || "",
    valueLongitude: valueDetails.longitude || "",
  };
}

/**
 * Placeholders describing the statement a qualifier or reference belongs to.
 * @param {Object} context - Item-level placeholders
 * @param {string} propertyId - The statement's property
 * @param {Object} mainValue - Details of the statement's main value
 */
function statementPlaceholders(context, propertyId, mainValue) {
  return {
    ...context,
    statementPropertyId: propertyId,
    statementValueId: mainValue.entityId || "",
    statementValueSparql: sparqlTerm(mainValue),
    statementValueLabel: mainValue.label || mainValue.value || "",
  };
}

function sparqlTerm(valueDetails) {
  if (valueDetails.entityId) return "wd:" + valueDetails.entityId;
  return valueDetails.value || "";
}

function matchesValueId(valueId, configValueId) {
  if (!configValueId || configValueId.length === 0) return true;
  return configValueId.includes(valueId);
}

/**
 * Queue the buttons of every template at scope/section/propertyId, plus the
 * edit-mode "+" for that spot.
 * @param {jQuery} $anchor - Where the buttons go
 * @param {string} scope - "entity", "property" or "value"
 * @param {string} section - "statement", "qualifiers" or "references"
 * @param {string|null} propertyId - null for scope "entity"
 * @param {Object} placeholders - Values for replacePlaceholders()
 * @param {string|null} value - The raw value, matched against valueId; null for
 *   property/entity buttons
 * @param {Object} target - Describes this spot to the editor
 * @param {Set<string>} [shown] - Template ids already shown in this block;
 *   these are skipped and new ones added (one button per template per block)
 */
function addButtons($anchor, scope, section, propertyId, placeholders, value, target, shown) {
  const key = templateKey(scope, section, propertyId);
  const queries =
    scope === "entity" ? _templateIndex.queries.entity : (_templateIndex.queries.byKey.get(key) ?? []);
  const links =
    scope === "entity" ? _templateIndex.links.entity : (_templateIndex.links.byKey.get(key) ?? []);

  const fresh = (t) => {
    if (!shown) return true;
    if (shown.has(t.id)) return false;
    shown.add(t.id);
    return true;
  };

  for (const query of queries) {
    if (value !== null && !matchesValueId(value, query.valueId)) continue;
    if (!fresh(query)) continue;
    createQueryPopup(
      $anchor,
      encodeQueryString(replacePlaceholders(query.template, placeholders)),
      query.emoji,
      replacePlaceholders(query.title, placeholders),
      scope,
      { kind: "query", id: query.id },
    );
  }
  for (const link of links) {
    if (value !== null && !matchesValueId(value, link.valueId)) continue;
    if (!fresh(link)) continue;
    createLinkButton(
      $anchor,
      replacePlaceholders(link.urlTemplate, placeholders),
      link.emoji,
      replacePlaceholders(link.title, placeholders),
      { kind: "link", id: link.id },
    );
  }

  if (_editMode) createAddSlot($anchor, target);
}

/**
 * Process entity-level features (attached to the entity title)
 * @param {jQuery} $titleElement - The title element
 * @param {Object} context - Context with itemId, itemLabel, userLanguage
 */
function processEntityFeatures($titleElement, context) {
  addButtons($titleElement, "entity", "statement", null, context, null, { scope: "entity" });
}

/**
 * Buttons for the qualifiers or the snaks of one reference of a statement.
 * @param {jQuery} $container - Element holding these snaks
 * @param {Object<string, Object[]>} snaks - Snaks by property
 * @param {string[]} order - Property order as shown
 * @param {string} section - "qualifiers" or "references"
 * @param {Object} context - Item and statement placeholders
 * @param {Object} statement - {propertyId, value} of the owning statement, for the editor
 */
function processSnaks($container, snaks, order, section, context, statement) {
  const all = _editMode;
  // A property template listing several qualifiers (replaces + replaced by)
  // would otherwise appear once per qualifier of the same statement.
  const shownPropertyTemplates = new Set();
  for (const propertyId of order) {
    const list = snaks[propertyId] || [];
    if (!list.length) continue;

    if (all || hasTemplates("property", section, propertyId)) {
      const $label = getSnakPropertyElement($container, list[0].hash);
      if ($label) {
        addButtons(
          $label,
          "property",
          section,
          propertyId,
          { ...context, propertyId },
          null,
          { scope: "property", section, propertyId, statement },
          shownPropertyTemplates,
        );
      }
    }

    if (all || hasTemplates("value", section, propertyId)) {
      for (const snak of list) {
        const valueDetails = extractValueFromMainsnak(snak);
        if (!valueDetails.value) continue;
        const $snak = getSnakElement($container, snak.hash);
        if (!$snak) continue;
        if (valueDetails.label === null) valueDetails.label = getSnakValueLabel($snak);
        addButtons(
          getSnakIndicatorElement($snak),
          "value",
          section,
          propertyId,
          valuePlaceholders(context, propertyId, valueDetails),
          valueDetails.value,
          { scope: "value", section, propertyId, value: valueDetails, statement },
        );
      }
    }
  }
}

/**
 * Process a single claim (statement) from the entity data
 * @param {string} propertyId - The property ID
 * @param {Object} claim - The claim object from entityData.claims
 * @param {Object} context - Context with itemId, itemLabel, userLanguage
 * @param {{main: boolean, qualifiers: boolean, references: boolean}} wanted
 */
function processClaim(propertyId, claim, context, wanted) {
  const $statementElement = getStatementElement(claim.id);
  if (!$statementElement) return;

  const valueDetails = extractValueFromMainsnak(claim.mainsnak);
  if (valueDetails.value && valueDetails.label === null) {
    valueDetails.label = getStatementValueLabel($statementElement);
  }

  if (wanted.main && valueDetails.value) {
    const $indicatorElement = getStatementIndicatorElement($statementElement);
    if ($indicatorElement && $indicatorElement.length) {
      addButtons(
        $indicatorElement,
        "value",
        "statement",
        propertyId,
        valuePlaceholders(context, propertyId, valueDetails),
        valueDetails.value,
        { scope: "value", section: "statement", propertyId, value: valueDetails },
      );
    }
  }

  if (!wanted.qualifiers && !wanted.references) return;
  const statementContext = statementPlaceholders(context, propertyId, valueDetails);
  const statement = { propertyId, value: valueDetails };

  if (wanted.qualifiers && claim.qualifiers) {
    const $qualifiers = getQualifiersElement($statementElement);
    if ($qualifiers) {
      processSnaks(
        $qualifiers,
        claim.qualifiers,
        claim["qualifiers-order"] || Object.keys(claim.qualifiers),
        "qualifiers",
        statementContext,
        statement,
      );
    }
  }

  if (wanted.references && claim.references) {
    for (const reference of claim.references) {
      const $reference = getReferenceElement($statementElement, reference.hash);
      if (!$reference) continue;
      processSnaks(
        $reference,
        reference.snaks,
        reference["snaks-order"] || Object.keys(reference.snaks),
        "references",
        statementContext,
        statement,
      );
    }
  }
}

/**
 * Process all claims for a property
 * @param {string} propertyId - The property ID
 * @param {Array} claims - Array of claims for this property
 * @param {Object} context - Context with itemId, itemLabel, userLanguage
 */
function processPropertyClaims(propertyId, claims, context) {
  // Check the index before touching the DOM, so properties without any
  // template cost nothing (matters when several builds run on one page).
  if (_editMode || hasTemplates("property", "statement", propertyId)) {
    const $propertyElement = getPropertyElement(propertyId);
    if ($propertyElement) {
      addButtons(
        $propertyElement,
        "property",
        "statement",
        propertyId,
        { ...context, propertyId },
        null,
        { scope: "property", section: "statement", propertyId },
      );
    }
  }

  const wanted = {
    main: _editMode || hasTemplates("value", "statement", propertyId),
    qualifiers: _editMode || hasSectionTemplates("qualifiers"),
    references: _editMode || hasSectionTemplates("references"),
  };
  if (wanted.main || wanted.qualifiers || wanted.references) {
    claims.forEach((claim) => processClaim(propertyId, claim, context, wanted));
  }
}
