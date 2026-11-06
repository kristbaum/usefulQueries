// ===== MAIN =====

// The item page being shown, kept so the buttons can be redrawn when the
// user's config or edit mode changes.
const _page = { entityData: null, context: null, $title: null };

// The logged-in user's validated config, or null before it has loaded (and
// for logged-out visitors).
let _userConfig = null;

/**
 * Activate a config: built-ins minus the hidden ones, plus the user's own.
 * Redraws the buttons if the page is already processed.
 * @param {Object} config - A validated config
 */
function applyUserConfig(config) {
  _userConfig = config;
  setActiveTemplates(
    mergeTemplates(USEFUL_QUERIES, config.queries, config.disabled),
    mergeTemplates(USEFUL_LINKS, config.links, config.disabled),
  );
  if (_page.entityData) renderButtons();
}

/** Draw (or redraw) every button on the current item page. */
function renderButtons() {
  clearButtons();
  processEntityFeatures(_page.$title, _page.context);
  Object.entries(_page.entityData.claims).forEach(([propertyId, claims]) => {
    processPropertyClaims(propertyId, claims, _page.context);
  });
  mountButtons();
}

/**
 * Load the user's config. Never rejects: on any problem the built-ins are
 * used, so a broken config page can't break the script.
 * @returns {Promise<void>}
 */
function loadOwnConfig() {
  if (!canConfigure()) return Promise.resolve();
  return Promise.resolve(loadConfig()).then(
    function (loaded) {
      applyUserConfig(loaded.config);
      if (loaded.errors.length) {
        mw.notify(
          $("<span>").append(
            SETTINGS.displayName + ": " + loaded.errors.length + " problem(s) in your config; those entries are skipped. ",
            $("<a>").attr("href", mw.util.getUrl(settingsPageTitle())).text("Open settings"),
          ),
          { type: "warn", tag: "usefulqueries-config" },
        );
      }
    },
    function () {
      // Network/API trouble: carry on with the built-ins.
    },
  );
}

/** Tools-menu entries on item pages. */
function addItemPortletLinks() {
  mw.loader.using("mediawiki.util").then(function () {
    const link = mw.util.addPortletLink(
      "p-tb",
      "#",
      SETTINGS.displayName + ": edit buttons",
      "t-usefulqueries-edit-" + SETTINGS.configName,
      "Add your own usefulQueries buttons on this page, or hide built-in ones",
    );
    if (link) {
      $(link).on("click", function (e) {
        e.preventDefault();
        if (_page.entityData) toggleEditMode();
      });
    }
  });
  addSettingsPortletLink();
}

/**
 * Main function to orchestrate the processing of the Wikibase entity page
 */
function processWikibaseEntityPage() {
  const configReady = loadOwnConfig();

  mw.hook("wikibase.entityPage.entityLoaded").add(function (entityData) {
    if (entityData.type !== "item") {
      return;
    }

    const userLanguage = mw.config.get("wgUserLanguage");
    const $titleElement = getTitleElement();
    const itemLabel = getItemLabel(entityData, userLanguage);

    // The hook remembers its last firing, so this also runs when the config
    // loads after the entity.
    configReady.then(function () {
      _page.entityData = entityData;
      _page.$title = $titleElement;
      _page.context = {
        itemId: entityData.id,
        itemLabel: itemLabel,
        userLanguage: userLanguage,
      };
      renderButtons();

      if (canConfigure()) {
        addItemPortletLinks();
        // Deep link from the settings page: ?usefulqueries-edit=<id>
        const editId = mw.util.getParamValue("usefulqueries-edit");
        if (editId && _userConfig) {
          const kind = _userConfig.queries.some((t) => t.id === editId) ? "query" : "link";
          openTemplateEditor(null, { kind, id: editId });
        }
      }
    });
  });
}

// Initialize the main processing
if (ON_SETTINGS_PAGE) {
  renderSettingsPage();
} else if (ON_CONFIG_PAGE) {
  addSettingsPortletLink();
} else {
  processWikibaseEntityPage();
}
