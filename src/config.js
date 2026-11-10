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

/**
 * URL of an item page (in the configured item namespace), optionally with
 * query parameters and a "#P123" anchor in `qid`.
 * @param {string} qid - e.g. "Q42" or "Q42#P19"
 * @param {Object} [params]
 */
function itemPageUrl(qid, params) {
  const ns = SETTINGS.allowedNamespace;
  const prefix = ns ? mw.config.get("wgFormattedNamespaces")[ns] + ":" : "";
  return mw.util.getUrl(prefix + qid, params);
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
 * Save the logged-in user's config. `transform` gets the config as it is on
 * the wiki right now (empty if the page does not exist yet) and the page text
 * (null if missing), and returns the config to save. It may throw an error
 * code (a string) to abort. One read, then either an edit or, for a missing
 * page, a create; a concurrent change makes MediaWiki reject the edit instead
 * of silently overwriting it.
 * @param {function(object, ?string): object} transform
 * @param {string} summary - Edit summary
 * @param {{keepInvalid?: boolean}} [options] - keepInvalid: write the entries
 *   this script can't use back to the page unchanged (see keepSkipped())
 * @returns {Promise<object>} The saved config, valid entries only
 */
function saveConfig(transform, summary, options = {}) {
  const title = configPageTitle();
  const params = { summary: summary + " (usefulQueries)" };
  let saved = null;

  function apply(text) {
    const current = parseUserConfig(text, BUILTIN_IDS);
    if (text !== null && current.errors.some((e) => e.startsWith("not valid JSON"))) {
      throw "usefulqueries-invalid-json";
    }
    saved = transform(current.config, text);
    if (!options.keepInvalid) return serializeConfig(saved);
    // Copy the lists: `saved` is what the caller renders, so it must stay valid.
    const toWrite = { ...saved, queries: [...saved.queries], links: [...saved.links] };
    return serializeConfig(keepSkipped(toWrite, current.skipped));
  }

  return mw.loader.using("mediawiki.api").then(function () {
    const api = new mw.Api();
    return api
      .edit(title, (revision) => ({ ...params, text: apply(revision.content) }))
      .catch(function (code) {
        if (code !== "nocreate-missing") return $.Deferred().reject(code).promise();
        return api.create(title, params, apply(null));
      })
      .then(() => saved);
  });
}

/**
 * Change the config in place, starting from what is saved right now, so edits
 * from two tabs never overwrite each other.
 * @param {function(object): void} mutate
 * @param {string} summary
 */
function updateConfig(mutate, summary) {
  return saveConfig(
    function (config) {
      mutate(config);
      return config;
    },
    summary,
    { keepInvalid: true },
  );
}

/**
 * Overwrite the config with `config`, but only if the page still holds
 * `expectedText` (what the settings page loaded; null if it did not exist).
 * Rejects with "usefulqueries-conflict" otherwise.
 */
function replaceConfig(config, expectedText, summary) {
  return saveConfig(function (current, text) {
    if (text !== expectedText) throw "usefulqueries-conflict";
    return config;
  }, summary);
}

/** Human-readable message for a failed save. */
function describeSaveError(code) {
  // articleexists / editconflict: someone saved between our read and write.
  if (code === "usefulqueries-conflict" || code === "articleexists" || code === "editconflict") {
    return "Your usefulQueries config was changed elsewhere (another tab?). Reload this page and try again.";
  }
  if (code === "usefulqueries-invalid-json") {
    return "Your config page is not valid JSON, so it was not changed. Fix or blank it first: " + configPageTitle();
  }
  return "Saving failed: " + code;
}
