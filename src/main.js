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
