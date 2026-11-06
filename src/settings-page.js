// ===== SETTINGS PAGE =====
// Special:BlankPage/<configName>: switch built-ins on and off, manage your own
// buttons, import buttons from other users. Saves to configPageTitle().

const SETTINGS_COMPONENTS = ["CdxButton", "CdxMessage", "CdxTextInput", "CdxToggleSwitch", "CdxCheckbox"];

const SCOPE_HEADINGS = {
  entity: "Next to the item title",
  property: "Next to a property",
  value: "Next to a statement value",
};

/**
 * Fetch labels for entity IDs in the user's language.
 * @param {string[]} ids
 * @returns {Promise<Object<string, string>>} id → label
 */
function fetchLabels(ids) {
  const unique = [...new Set(ids)];
  const api = new mw.Api();
  const chunks = [];
  for (let i = 0; i < unique.length; i += 50) chunks.push(unique.slice(i, i + 50));
  return Promise.all(
    chunks.map((chunk) =>
      api
        .get({
          action: "wbgetentities",
          ids: chunk.join("|"),
          props: "labels",
          languages: mw.config.get("wgUserLanguage"),
          languagefallback: 1,
          formatversion: 2,
        })
        .then((data) => data.entities || {}, () => ({})),
    ),
  ).then(function (results) {
    const labels = {};
    for (const entities of results) {
      for (const [id, entity] of Object.entries(entities)) {
        const label = entity.labels && Object.values(entity.labels)[0];
        if (label) labels[id] = label.value;
      }
    }
    return labels;
  });
}

/**
 * A template's example item with the anchor of the statement group that
 * triggers it (Q454172#P937), so the link scrolls to where the button is.
 * Qualifier/reference and entity buttons link to the item itself. If the
 * example lacks that property, the browser simply stays at the top.
 */
function withAnchor(t) {
  return t.scope !== "entity" && sectionOf(t) === "statement" && t.propertyId
    ? t.example + "#" + t.propertyId[0]
    : t.example;
}

/** Show placeholders in a title as readable markers. */
function humanizeTitle(title) {
  return title
    .replace(/\{itemLabel\}/g, "‹item›")
    .replace(/\{valueLabel\}/g, "‹value›")
    .replace(/\{(\w+)\}/g, "‹$1›");
}

/** Tools-menu link to the settings page. */
function addSettingsPortletLink() {
  mw.loader.using("mediawiki.util").then(function () {
    mw.util.addPortletLink(
      "p-tb",
      mw.util.getUrl(settingsPageTitle()),
      SETTINGS.displayName + " settings",
      "t-usefulqueries-settings-" + SETTINGS.configName,
      "Choose which usefulQueries buttons you see and make your own",
    );
  });
}

/** Render the settings page into the content area. */
function renderSettingsPage() {
  const heading = SETTINGS.displayName + " settings";
  document.title = heading + " – " + mw.config.get("wgSiteName");
  $("#firstHeading, .mw-first-heading").first().text(heading);
  const $content = $("#mw-content-text").empty();

  if (!canConfigure()) {
    $content.append(
      $("<p>").text("Log in to choose which usefulQueries buttons you see and to make your own."),
    );
    return;
  }

  const mountPoint = document.createElement("div");
  $content.append(mountPoint);
  $(mountPoint).text("Loading…");

  loadCodex(SETTINGS_COMPONENTS, ["mediawiki.api", "mediawiki.util"])
    .then(function (codex) {
      if (codex.missing) return { codex };
      return loadConfig().then(function (loaded) {
        const ids = [];
        for (const t of [...USEFUL_QUERIES, ...USEFUL_LINKS, ...loaded.config.queries, ...loaded.config.links]) {
          ids.push(...(t.propertyId || []), ...(t.valueId || []));
        }
        return fetchLabels(ids).then((labels) => ({ codex, loaded, labels }));
      });
    })
    .then(function ({ codex, loaded, labels }) {
      if (codex.missing) {
        $(mountPoint).text(codex.missing);
        return;
      }
      $(mountPoint).empty();
      mountSettingsApp(codex.Vue, codex.Codex, mountPoint, loaded, labels);
    })
    .catch(function (err) {
      $(mountPoint).text("Could not load your usefulQueries config: " + err);
    });
}

function mountSettingsApp(Vue, Codex, mountPoint, loaded, labels) {
  mw.util.addCSS(
    ".uq-settings .uq-list { list-style: none; margin: 0 0 1.5em; padding: 0; }" +
      ".uq-settings .uq-item { display: flex; gap: 12px; align-items: flex-start; padding: 8px 0; border-bottom: 1px solid #eaecf0; }" +
      ".uq-settings .uq-emoji { font-size: 1.3em; width: 1.6em; text-align: center; flex: none; }" +
      ".uq-settings .uq-body { flex: 1; min-width: 0; }" +
      ".uq-settings .uq-meta { font-size: 0.875em; opacity: 0.8; }" +
      ".uq-settings .uq-badge { display: inline-block; font-size: 0.75em; padding: 0 6px; border-radius: 8px; border: 1px solid currentColor; margin-left: 6px; vertical-align: middle; }" +
      ".uq-settings .uq-actions { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; flex: none; }" +
      ".uq-settings .uq-bar { position: sticky; bottom: 0; background: var(--background-color-base, #fff); padding: 10px 0; border-top: 1px solid #a2a9b1; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; z-index: 2; }" +
      ".uq-settings .uq-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }",
  );

  const builtins = [
    ...USEFUL_QUERIES.map((t) => ({ kind: "query", t })),
    ...USEFUL_LINKS.map((t) => ({ kind: "link", t })),
  ];

  const app = Vue.createMwApp({
    name: "UsefulQueriesSettings",
    data: function () {
      return {
        config: JSON.parse(JSON.stringify(loaded.config)),
        savedText: serializeConfig(loaded.config),
        loadedText: loaded.text,
        exists: loaded.exists,
        loadErrors: loaded.errors,
        labels,
        saving: false,
        saveError: null,
        confirmDelete: null,
        importUser: "",
        importStatus: null,
        importList: [],
        importPicked: [],
        displayName: SETTINGS.displayName,
        helpUrl: SETTINGS.helpUrl,
      };
    },
    computed: {
      groups: function () {
        return ["entity", "property", "value"]
          .map((scope) => ({
            scope,
            heading: SCOPE_HEADINGS[scope],
            items: builtins.filter((b) => b.t.scope === scope),
          }))
          .filter((g) => g.items.length);
      },
      own: function () {
        return [
          ...this.config.queries.map((t) => ({ kind: "query", t })),
          ...this.config.links.map((t) => ({ kind: "link", t })),
        ];
      },
      dirty: function () {
        return serializeConfig(this.normalized()) !== this.savedText || !this.exists;
      },
      hiddenCount: function () {
        return this.config.disabled.filter((id) => BUILTIN_IDS.includes(id)).length;
      },
      configPageUrl: function () {
        return mw.util.getUrl(configPageTitle());
      },
      configTitle: function () {
        return configPageTitle();
      },
    },
    methods: {
      normalized: function () {
        // Everything on this page has now been seen; drop ids of built-ins
        // that no longer exist so the page does not collect clutter.
        return {
          ...this.config,
          disabled: this.config.disabled.filter((id) => BUILTIN_IDS.includes(id)),
          seen: [...BUILTIN_IDS],
        };
      },
      isOn: function (id) {
        return !this.config.disabled.includes(id);
      },
      setOn: function (id, on) {
        const disabled = this.config.disabled.filter((d) => d !== id);
        if (!on) disabled.push(id);
        this.config.disabled = disabled;
      },
      setAll: function (on) {
        this.config.disabled = on ? [] : [...BUILTIN_IDS];
      },
      isNew: function (id) {
        return this.exists && !this.config.seen.includes(id);
      },
      describe: function (t) {
        const prop = (id) => (this.labels[id] ? this.labels[id] + " (" + id + ")" : id);
        if (t.scope === "entity") return "every item";
        let text = (t.propertyId || []).map(prop).join(", ");
        if (t.valueId) text += " = " + t.valueId.map(prop).join(" or ");
        if (t.section === "qualifiers") text = "qualifier " + text;
        if (t.section === "references") text += " in references";
        return text;
      },
      title: function (t) {
        return humanizeTitle(t.title);
      },
      exampleUrl: function (t) {
        return t.example ? itemPageUrl(withAnchor(t)) : null;
      },
      editUrl: function (t) {
        return itemPageUrl(withAnchor(t), { "usefulqueries-edit": t.id });
      },
      suggestUrl: function (entry) {
        return suggestionIssueUrl(entry.t, entry.kind, SETTINGS.repositoryUrl);
      },
      removeOwn: function (entry) {
        removeTemplate(this.config, entry.t.id);
        this.confirmDelete = null;
      },
      loadImport: function () {
        const vm = this;
        const user = vm.importUser.trim().replace(/^User:/i, "");
        if (!user) return;
        vm.importStatus = { type: "notice", text: "Loading…" };
        vm.importList = [];
        vm.importPicked = [];
        loadConfig(user)
          .then(function (other) {
            if (!other.exists) {
              vm.importStatus = { type: "warning", text: user + " has no usefulQueries config on this wiki." };
              return;
            }
            vm.importList = [
              ...other.config.queries.map((t) => ({ kind: "query", t })),
              ...other.config.links.map((t) => ({ kind: "link", t })),
            ];
            vm.importStatus = vm.importList.length
              ? null
              : { type: "notice", text: user + " has not made any buttons of their own." };
          })
          .catch(function (err) {
            vm.importStatus = { type: "error", text: "Could not load: " + err };
          });
      },
      addImported: function () {
        const picked = this.importList.filter((e) => this.importPicked.includes(e.kind + ":" + e.t.id));
        const next = importTemplates(this.config, picked.map((e) => ({ kind: e.kind, template: e.t })), BUILTIN_IDS);
        this.config.queries = next.queries;
        this.config.links = next.links;
        this.importStatus = {
          type: "success",
          text: "Added " + picked.length + " button" + (picked.length === 1 ? "" : "s") + ". Save to keep them.",
        };
        this.importPicked = [];
      },
      save: function () {
        const vm = this;
        const config = vm.normalized();
        vm.saving = true;
        vm.saveError = null;
        replaceConfig(config, vm.loadedText, "Update settings")
          .then(function () {
            vm.loadedText = serializeConfig(config);
            vm.savedText = vm.loadedText;
            vm.exists = true;
            vm.config.seen = config.seen;
            vm.config.disabled = config.disabled;
            mw.notify("usefulQueries settings saved.", { tag: "usefulqueries" });
          })
          .catch(function (code) {
            vm.saveError = describeSaveError(code);
          })
          .always(function () {
            vm.saving = false;
          });
      },
    },
    template: `
      <div class="uq-settings">
        <p class="uq-meta" style="float: right; margin: 0 0 8px 12px;">
          <a :href="helpUrl" target="_blank" rel="noopener">Help: how to add and edit buttons ↗</a>
        </p>
        <p>
          Choose which buttons {{ displayName }} adds to item pages, and manage buttons you made yourself.
          To make a new button, open an item and choose <em>{{ displayName }}: edit buttons</em> in the Tools menu,
          then click “+” where the button should go. The <a :href="helpUrl" target="_blank" rel="noopener">help page</a>
          explains every step and control.
        </p>
        <p class="uq-meta">
          Your choices are stored on <a :href="configPageUrl">{{ configTitle }}</a>,
          a page in your user space that only you can edit (and anyone can read).
        </p>
        <cdx-message v-if="loadErrors.length" type="warning">
          Some entries on your config page are invalid and are ignored (saving here removes them):
          <ul><li v-for="e in loadErrors" :key="e">{{ e }}</li></ul>
        </cdx-message>

        <h2>Your buttons</h2>
        <p v-if="!own.length" class="uq-meta">None yet.</p>
        <ul class="uq-list">
          <li v-for="entry in own" :key="entry.t.id" class="uq-item">
            <span class="uq-emoji">{{ entry.t.emoji }}</span>
            <div class="uq-body">
              <div>{{ title(entry.t) }} <span class="uq-badge">{{ entry.kind === 'query' ? 'Query' : 'Link' }}</span></div>
              <div class="uq-meta">Shown for {{ describe(entry.t) }} · <code>{{ entry.t.id }}</code></div>
            </div>
            <div class="uq-actions">
              <template v-if="confirmDelete !== entry.t.id">
                <a :href="editUrl(entry.t)">Edit on {{ entry.t.example }}</a>
                <a :href="suggestUrl(entry)" target="_blank" rel="noopener noreferrer">Suggest for everyone ↗</a>
                <cdx-button action="destructive" weight="quiet" @click="confirmDelete = entry.t.id">Delete</cdx-button>
              </template>
              <template v-else>
                <span>Delete?</span>
                <cdx-button action="destructive" weight="primary" @click="removeOwn(entry)">Delete</cdx-button>
                <cdx-button @click="confirmDelete = null">Keep</cdx-button>
              </template>
            </div>
          </li>
        </ul>

        <h2>Built-in buttons</h2>
        <div class="uq-row">
          <cdx-button @click="setAll(true)">Show all</cdx-button>
          <cdx-button @click="setAll(false)">Hide all</cdx-button>
          <span class="uq-meta" v-if="hiddenCount">{{ hiddenCount }} hidden</span>
        </div>
        <template v-for="g in groups" :key="g.scope">
          <h3>{{ g.heading }}</h3>
          <ul class="uq-list">
            <li v-for="b in g.items" :key="b.t.id" class="uq-item">
              <span class="uq-emoji">{{ b.t.emoji }}</span>
              <div class="uq-body">
                <div>
                  {{ title(b.t) }}
                  <span class="uq-badge">{{ b.kind === 'query' ? 'Query' : 'Link' }}</span>
                  <span v-if="isNew(b.t.id)" class="uq-badge" style="color: #36c;">new</span>
                </div>
                <div class="uq-meta">
                  Shown for {{ describe(b.t) }}
                  <template v-if="exampleUrl(b.t)"> · <a :href="exampleUrl(b.t)">see it on {{ b.t.example }}</a></template>
                </div>
              </div>
              <div class="uq-actions">
                <cdx-toggle-switch
                  :model-value="isOn(b.t.id)"
                  :aria-label="(isOn(b.t.id) ? 'Hide ' : 'Show ') + b.t.title"
                  @update:model-value="setOn(b.t.id, $event)"
                ></cdx-toggle-switch>
              </div>
            </li>
          </ul>
        </template>

        <h2>Import from another user</h2>
        <p class="uq-meta">Copy buttons someone else made. You get a copy; later changes on their side don't reach you.</p>
        <div class="uq-row">
          <cdx-text-input v-model="importUser" placeholder="Username" @keydown.enter.prevent="loadImport"></cdx-text-input>
          <cdx-button :disabled="!importUser.trim()" @click="loadImport">Show their buttons</cdx-button>
        </div>
        <cdx-message v-if="importStatus" :type="importStatus.type" :inline="true" style="margin-top: 8px;">{{ importStatus.text }}</cdx-message>
        <ul v-if="importList.length" class="uq-list">
          <li v-for="e in importList" :key="e.kind + ':' + e.t.id" class="uq-item">
            <cdx-checkbox v-model="importPicked" :input-value="e.kind + ':' + e.t.id">
              {{ e.t.emoji }} {{ title(e.t) }}
              <template #description>Shown for {{ describe(e.t) }}</template>
            </cdx-checkbox>
          </li>
        </ul>
        <cdx-button v-if="importList.length" :disabled="!importPicked.length" @click="addImported">Add selected</cdx-button>

        <div class="uq-bar">
          <cdx-button action="progressive" weight="primary" :disabled="!dirty || saving" @click="save">
            {{ saving ? 'Saving…' : 'Save' }}
          </cdx-button>
          <span class="uq-meta" v-if="!dirty">All changes saved.</span>
          <span class="uq-meta" v-else-if="!exists">Not saved yet — saving creates your config page.</span>
          <span class="uq-meta" v-else>Unsaved changes.</span>
          <cdx-message v-if="saveError" type="error" :inline="true">{{ saveError }}</cdx-message>
        </div>
      </div>
    `,
  });

  for (const name of SETTINGS_COMPONENTS) app.component(name, Codex[name]);
  app.mount(mountPoint);
}
