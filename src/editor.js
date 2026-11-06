// ===== EDITOR (item page) =====
// Edit mode and the "add / edit a button" dialog. Everything here runs only
// after the user opts in from the Tools menu, so it costs nothing otherwise.

// Codex components the editor needs; older wikis without them get a notice.
const EDITOR_COMPONENTS = [
  "CdxButton",
  "CdxDialog",
  "CdxField",
  "CdxMessage",
  "CdxRadio",
  "CdxTextArea",
  "CdxTextInput",
];

const EMOJI_SUGGESTIONS = ["🔍", "🗺️", "📅", "📊", "🖼️", "👥", "🏛️", "📚", "🔗", "🌳"];

const PREVIEW_ROWS = 5;

// The Vue instance of the dialog, created on first use.
let _editorVm = null;

/** SPARQL endpoint of the configured query service. */
function sparqlEndpoint() {
  return SETTINGS.sparqlEndpoint || new URL("sparql", SETTINGS.queryServiceUrl).href;
}

/** URL of an item page, optionally with query parameters. */
function itemPageUrl(qid, params) {
  const ns = SETTINGS.allowedNamespace;
  const prefix = ns ? mw.config.get("wgFormattedNamespaces")[ns] + ":" : "";
  return mw.util.getUrl(prefix + qid, params);
}

/** Label of a property as shown on the current page, or its ID. */
function propertyLabelOnPage(propertyId) {
  const $el = getPropertyElement(propertyId);
  let text = $el ? $el.find("a").first().text().trim() : "";
  // Qualifier and reference properties have no statement group of their own.
  if (!text) text = $('a[title="Property:' + propertyId + '"]').first().text().trim();
  return text || propertyId;
}

/** Value details of a snak, with the label read from the page if needed. */
function snakValueWithLabel(snak, $container) {
  const value = extractValueFromMainsnak(snak);
  if (value.value && value.label === null && $container) {
    const $snak = getSnakElement($container, snak.hash);
    value.label = $snak ? getSnakValueLabel($snak) : null;
  }
  return value;
}

/**
 * Find a spot on the current page where a template would show, so editing it
 * from the settings page can preview it with real values.
 * @param {Object} tpl - Template in JSON form
 * @returns {Object} A target as passed to openTemplateEditor
 */
function findTargetForTemplate(tpl) {
  if (tpl.scope === "entity") return { scope: "entity" };
  const claims = (_page.entityData && _page.entityData.claims) || {};
  const section = sectionOf(tpl);
  if (section !== "statement") return findSnakTarget(tpl, section, claims);
  for (const pid of tpl.propertyId) {
    if (!claims[pid]) continue;
    if (tpl.scope === "property") return { scope: "property", propertyId: pid };
    for (const claim of claims[pid]) {
      const value = extractValueFromMainsnak(claim.mainsnak);
      if (!value.value) continue;
      if (tpl.valueId && !tpl.valueId.includes(value.value)) continue;
      if (value.label === null) {
        const $st = getStatementElement(claim.id);
        value.label = $st ? getStatementValueLabel($st) : null;
      }
      return { scope: "value", propertyId: pid, value };
    }
  }
  // Not applicable on this item: edit without value placeholders filled in.
  return { scope: tpl.scope, section, propertyId: tpl.propertyId[0], value: null };
}

/** findTargetForTemplate() for qualifier and reference templates. */
function findSnakTarget(tpl, section, claims) {
  for (const [statementPid, list] of Object.entries(claims)) {
    for (const claim of list) {
      const $statement = getStatementElement(claim.id);
      const mainValue = extractValueFromMainsnak(claim.mainsnak);
      if (mainValue.value && mainValue.label === null && $statement) {
        mainValue.label = getStatementValueLabel($statement);
      }
      const statement = { propertyId: statementPid, value: mainValue };
      const groups =
        section === "qualifiers"
          ? [{ snaks: claim.qualifiers || {}, $el: $statement && getQualifiersElement($statement) }]
          : (claim.references || []).map((r) => ({
              snaks: r.snaks,
              $el: $statement && getReferenceElement($statement, r.hash),
            }));
      for (const group of groups) {
        for (const pid of tpl.propertyId) {
          for (const snak of group.snaks[pid] || []) {
            if (tpl.scope === "property") return { scope: "property", section, propertyId: pid, statement };
            const value = snakValueWithLabel(snak, group.$el);
            if (!value.value) continue;
            if (tpl.valueId && !tpl.valueId.includes(value.value)) continue;
            return { scope: "value", section, propertyId: pid, value, statement };
          }
        }
      }
    }
  }
  return { scope: tpl.scope, section, propertyId: tpl.propertyId[0], value: null, statement: null };
}

/** Switch edit mode on or off and redraw the buttons. */
function toggleEditMode() {
  _editMode = !_editMode;
  renderButtons();
  mw.notify(
    _editMode
      ? SETTINGS.displayName + " edit mode: “+” adds a button at that spot, ✕ hides a built-in, ✎ edits one of yours."
      : SETTINGS.displayName + " edit mode off.",
    { tag: "usefulqueries-editmode" },
  );
}

/**
 * Hide a built-in button for the logged-in user.
 * @param {{kind: string, id: string}} ref
 * @param {string} title - For the edit summary
 */
function hideBuiltinButton(ref, title) {
  updateConfig(function (config) {
    if (!config.disabled.includes(ref.id)) config.disabled.push(ref.id);
  }, "Hide button: " + title)
    .then(function (config) {
      applyUserConfig(config);
      mw.notify("Hidden. Bring it back on the " + SETTINGS.displayName + " settings page.", {
        tag: "usefulqueries",
      });
    })
    .catch(function (code) {
      mw.notify(describeSaveError(code), { type: "error", tag: "usefulqueries" });
    });
}

/**
 * Open the editor dialog, either for a new button at `target` or for an
 * existing user template `ref`.
 * @param {Object|null} target - {scope, propertyId?, value?}
 * @param {{kind: string, id: string}|null} ref
 */
function openTemplateEditor(target, ref) {
  let existing = null;
  if (ref) {
    const list = ref.kind === "query" ? _userConfig.queries : _userConfig.links;
    const tpl = list.find((t) => t.id === ref.id);
    if (!tpl) {
      mw.notify("That button is no longer in your config.", { type: "error" });
      return;
    }
    existing = { kind: ref.kind, template: tpl };
    target = target || findTargetForTemplate(tpl);
  }

  mw.loader.using(["@wikimedia/codex", "mediawiki.api"]).then(function (require) {
    const Vue = require("vue");
    const Codex = require("@wikimedia/codex");
    const missing = EDITOR_COMPONENTS.filter((name) => !Codex[name]);
    if (missing.length) {
      mw.notify(
        "The usefulQueries editor needs a newer Codex than this wiki has (missing " +
          missing.join(", ") + "). Edit " + configPageTitle() + " by hand instead.",
        { type: "error" },
      );
      return;
    }
    if (!_editorVm) _editorVm = mountEditor(Vue, Codex);
    _editorVm.start(target, existing);
  });
}

/**
 * Create the dialog's Vue app.
 * @returns {Object} The root component instance
 */
function mountEditor(Vue, Codex) {
  mw.util.addCSS(
    ".usefulqueries-editor { max-width: 60em; width: 100%; }" +
      ".usefulqueries-editor .uq-mono textarea, .usefulqueries-editor .uq-mono input { font-family: monospace; font-size: 0.9em; }" +
      ".usefulqueries-editor .uq-chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0; }" +
      ".usefulqueries-editor .uq-chip { font-family: monospace; font-size: 0.85em; padding: 1px 6px; border: 1px solid #a2a9b1; border-radius: 2px; background: none; cursor: pointer; color: inherit; }" +
      ".usefulqueries-editor .uq-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 6px; }" +
      ".usefulqueries-editor .uq-preview { overflow-x: auto; max-height: 16em; margin-top: 6px; }" +
      ".usefulqueries-editor .uq-preview table { font-size: 0.85em; }" +
      ".usefulqueries-editor .uq-muted { opacity: 0.75; font-size: 0.9em; }" +
      ".usefulqueries-editor section { margin-bottom: 1.2em; }",
  );

  const mountPoint = document.createElement("div");
  document.body.appendChild(mountPoint);

  const app = Vue.createMwApp({
    name: "UsefulQueriesEditor",
    data: function () {
      return {
        open: false,
        target: { scope: "entity" },
        existingId: null,
        existingExample: null,
        kind: "query",
        placement: "entity",
        propertyIdsText: "",
        valueIdsText: "",
        sparql: "",
        urlTemplate: "",
        emoji: "🔍",
        title: "",
        pasteUrl: "",
        pasteMessage: null,
        triedSave: false,
        saving: false,
        saveError: null,
        confirmDelete: false,
        preview: { status: "idle" },
        emojiSuggestions: EMOJI_SUGGESTIONS,
      };
    },
    computed: {
      section: function () {
        return this.target.section || "statement";
      },
      context: function () {
        const t = this.target;
        let base = _page.context;
        if (this.section !== "statement" && t.statement) {
          base = statementPlaceholders(base, t.statement.propertyId, t.statement.value);
        }
        if (t.scope === "value" && t.value && this.scope === "value") {
          return valuePlaceholders(base, t.propertyId, t.value);
        }
        const ctx = { ...base };
        if (t.scope !== "entity") ctx.propertyId = t.propertyId;
        return ctx;
      },
      statementText: function () {
        const st = this.target.statement;
        if (!st) return "";
        const v = st.value;
        return propertyLabelOnPage(st.propertyId) + " → " + (v ? v.label || v.value || "…" : "…");
      },
      propertyLabel: function () {
        return this.target.propertyId ? propertyLabelOnPage(this.target.propertyId) : "";
      },
      valueLabel: function () {
        const v = this.target.value;
        return v ? v.label || v.value : "";
      },
      valueIsItem: function () {
        const v = this.target.value;
        return !!(v && v.entityId && /^Q\d+$/.test(v.entityId));
      },
      where: function () {
        const t = this.target;
        if (t.scope === "entity") return "next to the item title";
        const spot =
          t.scope === "property"
            ? "“" + this.propertyLabel + "”"
            : "“" + this.propertyLabel + " → " + (this.valueLabel || "…") + "”";
        if (this.section === "qualifiers") {
          return "next to the qualifier " + spot + (this.statementText ? " of “" + this.statementText + "”" : "");
        }
        if (this.section === "references") {
          return "next to " + spot + " in a reference" + (this.statementText ? " of “" + this.statementText + "”" : "");
        }
        return "next to " + spot;
      },
      sectionNoun: function () {
        return { statement: "", qualifiers: "qualifier ", references: "reference " }[this.section];
      },
      scope: function () {
        if (this.placement === "entity") return "entity";
        if (this.placement === "property") return "property";
        return "value";
      },
      propertyIds: function () {
        return this.propertyIdsText.split(/[\s,]+/).filter(Boolean).map((p) => p.toUpperCase());
      },
      valueIds: function () {
        return this.valueIdsText.split(/[\s,]+/).filter(Boolean).map((q) => q.toUpperCase());
      },
      placeholders: function () {
        const list = [...BASE_PLACEHOLDERS];
        if (this.scope !== "entity") list.push(...PROPERTY_PLACEHOLDERS);
        if (this.scope === "value") list.push(...VALUE_PLACEHOLDERS);
        if (this.scope !== "entity" && this.section !== "statement") list.push(...STATEMENT_PLACEHOLDERS);
        return list;
      },
      sparqlLines: function () {
        return this.sparql.replace(/\s+$/, "").split("\n");
      },
      draft: function () {
        const tpl = {
          id: this.existingId || makeTemplateId(this.title, this.takenIds()),
          example: this.existingExample || _page.context.itemId,
          scope: this.scope,
        };
        if (this.scope !== "entity" && this.section !== "statement") tpl.section = this.section;
        if (this.scope !== "entity") tpl.propertyId = this.propertyIds;
        if (this.placement === "only") tpl.valueId = this.valueIds;
        if (this.kind === "query") {
          tpl.template = this.sparqlLines;
        } else {
          tpl.urlTemplate = this.urlTemplate.trim();
        }
        tpl.emoji = this.emoji.trim();
        tpl.title = this.title.trim();
        return tpl;
      },
      errors: function () {
        return validateTemplate(this.draft, this.kind, { sparqlChecks: false });
      },
      warnings: function () {
        if (this.kind !== "query" || !this.sparql.trim()) return [];
        return sparqlWarnings(this.sparqlLines);
      },
      filledQuery: function () {
        return replacePlaceholders(this.sparql, this.context);
      },
      filledUrl: function () {
        return replacePlaceholders(this.urlTemplate.trim(), this.context);
      },
      titlePreview: function () {
        return replacePlaceholders(this.title, this.context);
      },
      primaryAction: function () {
        return {
          label: this.saving ? "Saving…" : this.existingId ? "Save changes" : "Add button",
          actionType: "progressive",
          disabled: this.saving,
        };
      },
      suggestUrl: function () {
        return this.existingId
          ? suggestionIssueUrl(this.draft, this.kind, SETTINGS.repositoryUrl)
          : null;
      },
    },
    watch: {
      sparql: function () {
        this.preview = { status: "idle" };
      },
      placement: function () {
        this.preview = { status: "idle" };
      },
    },
    methods: {
      takenIds: function () {
        return [...BUILTIN_IDS, ..._userConfig.queries.map((t) => t.id), ..._userConfig.links.map((t) => t.id)];
      },
      start: function (target, existing) {
        this.target = target;
        this.triedSave = false;
        this.saving = false;
        this.saveError = null;
        this.confirmDelete = false;
        this.pasteUrl = "";
        this.pasteMessage = null;
        this.preview = { status: "idle" };
        if (existing) {
          const tpl = existing.template;
          this.existingId = tpl.id;
          this.existingExample = tpl.example;
          this.kind = existing.kind;
          this.placement =
            tpl.scope === "value" ? (tpl.valueId ? "only" : "every") : tpl.scope;
          this.propertyIdsText = (tpl.propertyId || []).join(", ");
          this.valueIdsText = (tpl.valueId || []).join(", ");
          this.sparql = existing.kind === "query" ? tpl.template.join("\n") : "";
          this.urlTemplate = tpl.urlTemplate || "";
          this.emoji = tpl.emoji;
          this.title = tpl.title;
        } else {
          this.existingId = null;
          this.existingExample = null;
          this.kind = "query";
          this.placement = target.scope === "value" ? "every" : target.scope;
          this.propertyIdsText = target.propertyId || "";
          this.valueIdsText = this.valueIsItem ? target.value.value : "";
          this.sparql = "";
          this.urlTemplate = "";
          this.emoji = "🔍";
          this.title = "";
        }
        this.open = true;
      },
      chipTitle: function (name) {
        const value = this.context[name];
        const example =
          value === undefined
            ? ""
            : "\nOn this item: " + (value === "" ? "(empty)" : value);
        return (PLACEHOLDER_HELP[name] || "") + example + "\nClick to insert.";
      },
      insert: function (refName, field, name) {
        const token = "{" + name + "}";
        const ref = this.$refs[refName];
        const el = ref && ref.$el ? ref.$el.querySelector("textarea, input") : null;
        if (el && typeof el.selectionStart === "number" && document.activeElement === el) {
          const start = el.selectionStart;
          const end = el.selectionEnd;
          this[field] = this[field].slice(0, start) + token + this[field].slice(end);
          this.$nextTick(function () {
            el.focus();
            el.setSelectionRange(start + token.length, start + token.length);
          });
        } else {
          this[field] = this[field] + token;
        }
      },
      openInQueryService: function () {
        const text = this.filledQuery.trim() || "SELECT ?item WHERE {\n  \n}";
        window.open(SETTINGS.queryServiceUrl + encodeQueryString(text), "_blank", "noopener,noreferrer");
      },
      importFromUrl: function () {
        const text = queryFromServiceUrl(this.pasteUrl);
        if (!text) {
          this.pasteMessage = {
            type: "error",
            text: "No query found in that link. Short links (w.wiki/…) can't be read — copy the full address from the browser's address bar instead.",
          };
          return;
        }
        const value = this.scope === "value" && this.target.value ? this.context : {};
        const result = generalizeQuery(text, {
          itemId: _page.context.itemId,
          valueId: value.valueId || null,
          valueSparql: value.valueSparql || null,
          statementValueId: this.context.statementValueId || null,
        });
        this.sparql = result.text;
        this.pasteUrl = "";
        this.pasteMessage = {
          type: "success",
          text: result.replacements.length
            ? "Query imported. Replaced " +
              result.replacements
                .map((r) => r.from + " → " + r.to + (r.count > 1 ? " (" + r.count + "×)" : ""))
                .join(", ") +
              ", so it works on other items too."
            : "Query imported. It contains no ID of this item or value — check it is meant to be the same everywhere.",
        };
      },
      runPreview: function () {
        const vm = this;
        const query = this.filledQuery;
        if (!query.trim()) return;
        const started = Date.now();
        vm.preview = { status: "running" };
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 65000);
        fetch(sparqlEndpoint() + "?format=json&query=" + encodeURIComponent(query), {
          headers: { Accept: "application/sparql-results+json" },
          signal: controller.signal,
        })
          .then(function (response) {
            if (!response.ok) {
              return response.text().then(function (body) {
                // WDQS puts the parser message in the first lines of the body.
                const line = body.split("\n").find((l) => /Exception|error/i.test(l)) || body.slice(0, 300);
                throw new Error("HTTP " + response.status + ": " + line.trim().slice(0, 400));
              });
            }
            return response.json();
          })
          .then(function (json) {
            const vars = (json.head && json.head.vars) || [];
            const bindings = (json.results && json.results.bindings) || [];
            vm.preview = {
              status: "done",
              vars,
              count: bindings.length,
              ms: Date.now() - started,
              rows: bindings.slice(0, PREVIEW_ROWS).map((b) =>
                vars.map((v) => (b[v] ? shortenTerm(b[v].value) : "")),
              ),
              isAsk: typeof json.boolean === "boolean",
            };
          })
          .catch(function (err) {
            vm.preview = {
              status: "error",
              error: err.name === "AbortError" ? "The query took longer than 60 seconds." : err.message,
            };
          })
          .finally(() => clearTimeout(timer));
      },
      save: function () {
        const vm = this;
        vm.triedSave = true;
        vm.saveError = null;
        if (vm.errors.length) return;
        const tpl = vm.draft;
        const kind = vm.kind;
        const replacing = vm.existingId;
        vm.saving = true;
        updateConfig(function (config) {
          config.queries = config.queries.filter((t) => t.id !== replacing);
          config.links = config.links.filter((t) => t.id !== replacing);
          (kind === "query" ? config.queries : config.links).push(tpl);
        }, (replacing ? "Edit button: " : "Add button: ") + tpl.title)
          .then(function (config) {
            vm.open = false;
            applyUserConfig(config);
            mw.notify(replacing ? "Button saved." : "Button added.", { tag: "usefulqueries" });
          })
          .catch(function (code) {
            vm.saveError = describeSaveError(code);
          })
          .always(function () {
            vm.saving = false;
          });
      },
      remove: function () {
        const vm = this;
        const id = vm.existingId;
        vm.saving = true;
        updateConfig(function (config) {
          config.queries = config.queries.filter((t) => t.id !== id);
          config.links = config.links.filter((t) => t.id !== id);
        }, "Delete button: " + vm.title)
          .then(function (config) {
            vm.open = false;
            applyUserConfig(config);
            mw.notify("Button deleted.", { tag: "usefulqueries" });
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
      <cdx-dialog
        v-model:open="open"
        class="usefulqueries-editor"
        :title="existingId ? 'Edit button' : 'Add a button'"
        :subtitle="'Shown ' + where"
        :use-close-button="true"
        :primary-action="primaryAction"
        :default-action="{ label: 'Cancel' }"
        @primary="save"
        @default="open = false"
      >
        <section v-if="target.scope === 'value'">
          <cdx-field :is-fieldset="true">
            <template #label>Where should the button appear?</template>
            <cdx-radio v-model="placement" name="uq-placement" input-value="every">
              Next to every {{ sectionNoun }}“{{ propertyLabel }}” value — the result is about that value
            </cdx-radio>
            <cdx-radio v-if="valueIsItem || placement === 'only'" v-model="placement" name="uq-placement" input-value="only">
              Only when {{ sectionNoun }}“{{ propertyLabel }}” is {{ valueLabel }} — the value only decides whether the button shows
            </cdx-radio>
            <cdx-radio v-model="placement" name="uq-placement" input-value="property">
              Once, next to the {{ sectionNoun }}“{{ propertyLabel }}” label — the query uses all of its values, or none
            </cdx-radio>
          </cdx-field>
          <cdx-field v-if="placement === 'only'">
            <template #label>Values that show the button</template>
            <template #help-text>Item IDs, separated by commas.</template>
            <cdx-text-input v-model="valueIdsText" class="uq-mono"></cdx-text-input>
          </cdx-field>
        </section>

        <section v-if="scope !== 'entity'">
          <cdx-field>
            <template #label>Properties</template>
            <template #help-text>
              The button appears for any of these. Add more (e.g. P19, P20) and use
              <code>{propertyId}</code> in the query to refer to the one that matched.
            </template>
            <cdx-text-input v-model="propertyIdsText" class="uq-mono"></cdx-text-input>
          </cdx-field>
        </section>

        <section>
          <cdx-field :is-fieldset="true">
            <template #label>What does the button do?</template>
            <cdx-radio v-model="kind" name="uq-kind" input-value="query">Run a SPARQL query in a popup</cdx-radio>
            <cdx-radio v-model="kind" name="uq-kind" input-value="link">Open a link to another website</cdx-radio>
          </cdx-field>
        </section>

        <section v-if="kind === 'query'">
          <cdx-field>
            <template #label>SPARQL query</template>
            <template #help-text>
              Easiest: write it in the Query Service for this item, then paste the link below — the IDs of
              this item and value are swapped for placeholders automatically.
            </template>
            <div class="uq-chips">
              <button v-for="p in placeholders" :key="p" type="button" class="uq-chip" :title="chipTitle(p)"
                @mousedown.prevent @click="insert('sparqlInput', 'sparql', p)">{{ '{' + p + '}' }}</button>
            </div>
            <p v-if="section !== 'statement' && scope !== 'entity'" class="uq-muted" style="margin: 4px 0;">
              The <code>{statement…}</code> placeholders refer to the statement this {{ sectionNoun.trim() }} belongs to
              ({{ statementText || 'its property and value' }}).
            </p>
            <cdx-text-area ref="sparqlInput" v-model="sparql" class="uq-mono" rows="12"
              placeholder="SELECT ?item ?itemLabel WHERE { … }"></cdx-text-area>
          </cdx-field>
          <div class="uq-row">
            <cdx-button @click="openInQueryService">Open in Query Service ↗</cdx-button>
            <cdx-text-input v-model="pasteUrl" style="flex: 1; min-width: 12em;"
              placeholder="…then paste the Query Service link here" @keydown.enter.prevent="importFromUrl"></cdx-text-input>
            <cdx-button :disabled="!pasteUrl.trim()" @click="importFromUrl">Use this query</cdx-button>
          </div>
          <cdx-message v-if="pasteMessage" :type="pasteMessage.type" :inline="true" style="margin-top: 6px;">
            {{ pasteMessage.text }}
          </cdx-message>
          <cdx-message v-for="w in warnings" :key="w" type="warning" :inline="true" style="margin-top: 6px;">
            {{ w }}
          </cdx-message>

          <div class="uq-row">
            <cdx-button :disabled="!sparql.trim() || preview.status === 'running'" @click="runPreview">
              {{ preview.status === 'running' ? 'Running…' : 'Test on this item' }}
            </cdx-button>
            <span v-if="preview.status === 'done' && !preview.isAsk">
              {{ preview.count }} row{{ preview.count === 1 ? '' : 's' }} in {{ (preview.ms / 1000).toFixed(1) }} s
            </span>
          </div>
          <cdx-message v-if="preview.status === 'error'" type="error" :inline="true" style="margin-top: 6px;">
            {{ preview.error }}
          </cdx-message>
          <cdx-message v-if="preview.status === 'done' && preview.count === 0 && !preview.isAsk" type="warning" :inline="true" style="margin-top: 6px;">
            No results on this item. A button should return rows on the item it is made on.
          </cdx-message>
          <div v-if="preview.status === 'done' && preview.count" class="uq-preview">
            <table class="wikitable">
              <thead><tr><th v-for="v in preview.vars" :key="v">{{ v }}</th></tr></thead>
              <tbody><tr v-for="(row, i) in preview.rows" :key="i"><td v-for="(cell, j) in row" :key="j">{{ cell }}</td></tr></tbody>
            </table>
          </div>
        </section>

        <section v-else>
          <cdx-field>
            <template #label>Link address</template>
            <template #help-text>Must start with https://. Placeholders are filled in for each item.</template>
            <div class="uq-chips">
              <button v-for="p in placeholders" :key="p" type="button" class="uq-chip" :title="chipTitle(p)"
                @mousedown.prevent @click="insert('urlInput', 'urlTemplate', p)">{{ '{' + p + '}' }}</button>
            </div>
            <cdx-text-input ref="urlInput" v-model="urlTemplate" class="uq-mono"
              placeholder="https://example.org/{itemId}"></cdx-text-input>
          </cdx-field>
          <p v-if="filledUrl" class="uq-muted">
            On this item: <a :href="filledUrl" target="_blank" rel="noopener noreferrer">{{ filledUrl }}</a>
          </p>
        </section>

        <section>
          <cdx-field>
            <template #label>Button</template>
            <template #help-text>A short label, usually one emoji.</template>
            <div class="uq-row" style="margin-top: 0;">
              <cdx-text-input v-model="emoji" style="width: 6em;"></cdx-text-input>
              <button v-for="e in emojiSuggestions" :key="e" type="button" class="uq-chip" @click="emoji = e">{{ e }}</button>
            </div>
          </cdx-field>
          <cdx-field>
            <template #label>Title</template>
            <template #help-text>Tooltip and popup heading.</template>
            <div class="uq-chips">
              <button v-for="p in placeholders" :key="p" type="button" class="uq-chip" :title="chipTitle(p)"
                @mousedown.prevent @click="insert('titleInput', 'title', p)">{{ '{' + p + '}' }}</button>
            </div>
            <cdx-text-input ref="titleInput" v-model="title" placeholder="People born in {valueLabel}"></cdx-text-input>
          </cdx-field>
          <p v-if="title.trim()" class="uq-muted">On this item: <strong>{{ emoji }}</strong> {{ titlePreview }}</p>
        </section>

        <cdx-message v-if="triedSave && errors.length" type="error">
          <ul style="margin: 0;"><li v-for="e in errors" :key="e">{{ e }}</li></ul>
        </cdx-message>
        <cdx-message v-if="saveError" type="error">{{ saveError }}</cdx-message>

        <section v-if="existingId" class="uq-row">
          <a v-if="suggestUrl" :href="suggestUrl" target="_blank" rel="noopener noreferrer">Suggest this button for everyone ↗</a>
          <span style="flex: 1;"></span>
          <template v-if="!confirmDelete">
            <cdx-button action="destructive" weight="quiet" @click="confirmDelete = true">Delete button</cdx-button>
          </template>
          <template v-else>
            <span>Delete “{{ title }}”?</span>
            <cdx-button action="destructive" weight="primary" :disabled="saving" @click="remove">Delete</cdx-button>
            <cdx-button @click="confirmDelete = false">Keep</cdx-button>
          </template>
        </section>
      </cdx-dialog>
    `,
  });

  for (const name of EDITOR_COMPONENTS) app.component(name, Codex[name]);
  return app.mount(mountPoint);
}

/** Shorten an entity URI to its ID for the preview table. */
function shortenTerm(value) {
  const m = /\/entity\/([A-Z]\d+)$/.exec(value);
  return m ? m[1] : value;
}
