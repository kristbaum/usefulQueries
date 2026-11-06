// ===== USER CONFIG (wiki I/O) =====
// Loads and saves User:<name>/<configName>.json with the user's own session.
// The pure parsing/merging lives in src/shared/user-config.mjs.

const BUILTIN_IDS = [...USEFUL_QUERIES, ...USEFUL_LINKS].map((t) => t.id);

/**
 * Title of a user's config page.
 * @param {string} [userName] - Defaults to the logged-in user
 */
function configPageTitle(userName) {
  return "User:" + (userName || mw.config.get("wgUserName")) + "/" + SETTINGS.configName + ".json";
}

/** Title of the settings page (Special:BlankPage/<configName>). */
function settingsPageTitle() {
  return "Special:BlankPage/" + SETTINGS.configName;
}

/** Whether the visitor can have a config at all. */
function canConfigure() {
  return !!mw.config.get("wgUserName");
}

/**
 * Fetch a config page.
 * @param {string} [userName]
 * @returns {Promise<{config: object, errors: string[], exists: boolean, text: string|null}>}
 */
function loadConfig(userName) {
  return mw.loader.using("mediawiki.api").then(function () {
    return new mw.Api()
      .get({
        action: "query",
        prop: "revisions",
        titles: configPageTitle(userName),
        rvprop: "content",
        rvslots: "main",
        formatversion: 2,
      })
      .then(function (data) {
        const page = data.query && data.query.pages && data.query.pages[0];
        const text =
          page && !page.missing && page.revisions
            ? page.revisions[0].slots.main.content
            : null;
        return { ...parseUserConfig(text, BUILTIN_IDS), text };
      });
  });
}

/**
 * Change the logged-in user's config. `mutate` receives the config as it is
 * saved on the wiki right now (not a possibly stale copy) and changes it in
 * place, so edits from two tabs never overwrite each other.
 * @param {function(object): void} mutate
 * @param {string} summary - Edit summary
 * @returns {Promise<object>} The saved config
 */
function updateConfig(mutate, summary) {
  const title = configPageTitle();
  const fullSummary = summary + " (usefulQueries)";
  return mw.loader.using("mediawiki.api").then(function () {
    const api = new mw.Api();
    let saved = null;
    return loadConfig().then(function (current) {
      if (!current.exists) {
        const config = emptyConfig(BUILTIN_IDS);
        mutate(config);
        saved = config;
        return api.create(title, { summary: fullSummary }, serializeConfig(config)).then(() => saved);
      }
      return api
        .edit(title, function (revision) {
          const fresh = parseUserConfig(revision.content, BUILTIN_IDS);
          if (fresh.errors.length && fresh.errors[0].startsWith("not valid JSON")) {
            return $.Deferred().reject("usefulqueries-invalid-json").promise();
          }
          mutate(fresh.config);
          saved = fresh.config;
          return { text: serializeConfig(fresh.config), summary: fullSummary };
        })
        .then(() => saved);
    });
  });
}

/**
 * Overwrite the config with `config`, but only if the page still holds
 * `expectedText` (what the settings page loaded). Rejects with
 * "usefulqueries-conflict" otherwise.
 * @param {object} config
 * @param {string|null} expectedText - null if the page did not exist
 * @param {string} summary
 */
function replaceConfig(config, expectedText, summary) {
  const title = configPageTitle();
  const fullSummary = summary + " (usefulQueries)";
  const text = serializeConfig(config);
  return mw.loader.using("mediawiki.api").then(function () {
    const api = new mw.Api();
    if (expectedText === null) {
      return api.create(title, { summary: fullSummary }, text).catch(function (code) {
        return $.Deferred()
          .reject(code === "articleexists" ? "usefulqueries-conflict" : code)
          .promise();
      });
    }
    return api.edit(title, function (revision) {
      if (revision.content !== expectedText) {
        return $.Deferred().reject("usefulqueries-conflict").promise();
      }
      return { text, summary: fullSummary };
    });
  });
}

/** Human-readable message for a failed save. */
function describeSaveError(code) {
  if (code === "usefulqueries-conflict") {
    return "Your usefulQueries config was changed elsewhere (another tab?). Reload this page and try again.";
  }
  if (code === "usefulqueries-invalid-json") {
    return "Your config page is not valid JSON, so it was not changed. Fix or blank it first: " + configPageTitle();
  }
  return "Saving failed: " + code;
}
