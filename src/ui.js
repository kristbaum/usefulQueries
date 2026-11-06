// ===== UI CREATION FUNCTIONS =====

// Buttons are collected while the claims are processed and rendered together
// by mountButtons(): one Vue app per build instead of one per button.
const _pendingButtons = [];

// What is currently on the page, so it can be torn down and rebuilt when the
// active templates or edit mode change.
const _mounted = { app: null, mountPoint: null, slots: [], generation: 0 };

/**
 * Append an empty slot to an anchor element; the button is teleported into it
 * later, so it keeps its position among the other buttons on that anchor.
 * @param {jQuery} element - The element to append the slot to
 * @returns {HTMLElement} The slot element
 */
function addButtonSlot(element) {
  const slot = document.createElement("span");
  slot.className = "usefulqueries-slot";
  $(element).append(slot);
  _mounted.slots.push(slot);
  return slot;
}

/**
 * Queue a Codex button with a link
 * @param {jQuery} element - The element to append the button to
 * @param {string} url - The URL to open when clicked
 * @param {string} buttonLabel - The label (emoji/text) for the button
 * @param {string} title - The tooltip for the button
 * @param {{kind: string, id: string}} [ref] - The template behind the button
 */
function createLinkButton(element, url, buttonLabel, title, ref) {
  _pendingButtons.push({
    kind: "link",
    slot: addButtonSlot(element),
    url,
    buttonLabel,
    title,
    ref: ref || null,
  });
}

/**
 * Queue an edit-mode "+" button that opens the editor for this spot.
 * @param {jQuery} element - The anchor element
 * @param {Object} target - Where a new button would go (scope, propertyId, value)
 */
function createAddSlot(element, target) {
  _pendingButtons.push({
    kind: "add",
    slot: addButtonSlot(element),
    target,
  });
}

/** Remove every button this script put on the page. */
function clearButtons() {
  if (_mounted.app) {
    _mounted.app.unmount();
    _mounted.mountPoint.remove();
    _mounted.app = null;
    _mounted.mountPoint = null;
  }
  _mounted.slots.forEach((slot) => slot.remove());
  _mounted.slots = [];
  _pendingButtons.length = 0;
  // Invalidates a mountButtons() still waiting for Codex.
  _mounted.generation++;
}

/**
 * Queue a Codex popup button with an embedded query
 * @param {jQuery} element - The element to append the popup button to
 * @param {string} querystring - The encoded query string
 * @param {string} buttonLabel - The label (emoji/text) for the button
 * @param {string} title - The tooltip and popup heading
 * @param {string} scope - Template scope ("entity", "property", or "value")
 * @param {{kind: string, id: string}} [ref] - The template behind the button
 */
function createQueryPopup(
  element,
  querystring,
  buttonLabel,
  title,
  scope,
  ref,
) {
  /* __IF_QLEVER__ */
  const qleverHref = getQLeverUrl(querystring);
  /* __ENDIF_QLEVER__ */
  /* __IF_NOT_QLEVER__ */
  const qleverHref = null;
  /* __ENDIF_NOT_QLEVER__ */

  _pendingButtons.push({
    kind: "popup",
    slot: addButtonSlot(element),
    buttonLabel,
    title,
    queryServiceHref: SETTINGS.queryServiceUrl + querystring,
    embedHref: SETTINGS.queryEmbedUrl + querystring,
    qleverHref,
    placement: (scope === "value") ? "bottom" : "bottom-start",
    ref: ref || null,
  });
}

/**
 * Popover button for one query. Each instance keeps its own open state and
 * only creates its iframe while open.
 */
const UsefulQueriesPopover = {
  name: "UsefulQueriesPopover",
  props: {
    button: { type: Object, required: true },
    iframeSize: { type: Number, required: true },
  },
  data: function () {
    return {
      open: false,
      anchorEl: null,
      primaryAction: {
        label: "Open in query service",
        actionType: "progressive",
      },
      defaultAction: this.button.qleverHref ? { label: "Open in QLever" } : null,
    };
  },
  mounted: function () {
    this.anchorEl = this.$refs.triggerEl || null;
  },
  methods: {
    openQueryService: function () {
      window.open(this.button.queryServiceHref, "_blank", "noopener,noreferrer");
    },
    openQLever: function () {
      if (this.button.qleverHref) {
        window.open(this.button.qleverHref, "_blank", "noopener,noreferrer");
      }
    },
  },
  template: `
      <span ref="triggerEl">
        <cdx-button
          weight="quiet"
          action="progressive"
          :aria-label="button.title"
          :title="button.title"
          @click="$event.preventDefault(); open = !open"
        >
          {{ button.buttonLabel }}
        </cdx-button>
      </span>

      <cdx-popover
        v-if="anchorEl"
        v-model:open="open"
        :anchor="anchorEl"
        :placement="button.placement"
        :render-in-place="false"
        :title="button.title"
        :use-close-button="true"
        :use-bottom-sheet="true"
        :primary-action="primaryAction"
        :default-action="defaultAction"
        class="usefulqueries-popover"
        style="z-index: 999;"
        @primary="openQueryService"
        @default="openQLever"
      >
        <iframe
          v-if="open"
          scrolling="yes"
          frameborder="0"
          :src="button.embedHref"
          :width="iframeSize"
          :height="iframeSize"
        ></iframe>
      </cdx-popover>
    `,
};

/**
 * Render all queued buttons with a single Vue app that teleports each button
 * into its slot.
 */
function mountButtons() {
  // A slot whose anchor was not found never made it into the page; teleporting
  // into it would render nothing, so leave those buttons out.
  const buttons = _pendingButtons.splice(0).filter((b) => b.slot.isConnected);
  if (!buttons.length) return;
  const generation = _mounted.generation;
  const editMode = _editMode;
  const userIds = new Set(
    _userConfig ? [..._userConfig.queries, ..._userConfig.links].map((t) => t.id) : [],
  );
  for (const b of buttons) {
    b.isUser = !!(b.ref && userIds.has(b.ref.id));
  }

  mw.loader.using("@wikimedia/codex").then(function (require) {
    // Torn down (e.g. edit mode toggled) before Codex finished loading.
    if (generation !== _mounted.generation) return;
    const Vue = require("vue");
    const Codex = require("@wikimedia/codex");

    if (Codex.CdxPopover) {
      if (buttons.some((b) => b.kind === "popup")) {
        mw.util.addCSS(".usefulqueries-popover { max-width: none !important; }");
      }
    } else {
      // Older Codex versions (e.g. some Wikibase Cloud instances) lack CdxPopover;
      // fall back to plain link buttons to avoid rendering the component inline.
      for (const b of buttons) {
        if (b.kind === "popup") {
          b.kind = "link";
          b.url = b.queryServiceHref;
        }
      }
    }

    if (editMode) {
      mw.util.addCSS(
        ".usefulqueries-add .cdx-button, .usefulqueries-edit .cdx-button { min-width: 0; padding: 0 4px; opacity: .75; }" +
          ".usefulqueries-add .cdx-button { border: 1px dashed currentColor; }",
      );
    }

    const mountPoint = document.createElement("div");
    mountPoint.hidden = true;
    document.body.appendChild(mountPoint);

    const app = Vue.createMwApp({
      name: "UsefulQueriesButtons",
      data: function () {
        return {
          // Static list holding DOM nodes; keep Vue from proxying it.
          buttons: Vue.markRaw(buttons),
          editMode,
          iframeSize: Math.min(Math.max(window.innerWidth - 40, 400), 800),
        };
      },
      methods: {
        add: function (b) {
          openTemplateEditor(b.target, null);
        },
        editOrHide: function (b) {
          if (b.isUser) {
            openTemplateEditor(null, b.ref);
          } else {
            hideBuiltinButton(b.ref, b.title);
          }
        },
      },
      template: `
          <template v-for="(b, i) in buttons" :key="i">
            <teleport :to="b.slot">
              <span v-if="b.kind === 'add'" class="usefulqueries-add">
                <cdx-button
                  weight="quiet"
                  aria-label="Add a usefulQueries button here"
                  title="Add a usefulQueries button here"
                  @click="add(b)"
                >+</cdx-button>
              </span>
              <a
                v-else-if="b.kind === 'link'"
                :href="b.url"
                target="_blank"
                rel="noopener noreferrer"
                :title="b.title"
                style="text-decoration: none;"
              >
                <cdx-button weight="quiet" action="progressive" :aria-label="b.title">
                  {{ b.buttonLabel }}
                </cdx-button>
              </a>
              <useful-queries-popover
                v-else
                :button="b"
                :iframe-size="iframeSize"
              ></useful-queries-popover>
              <span v-if="editMode && b.ref" class="usefulqueries-edit">
                <cdx-button
                  weight="quiet"
                  :action="b.isUser ? 'progressive' : 'destructive'"
                  :aria-label="b.isUser ? 'Edit this button' : 'Hide this button'"
                  :title="b.isUser ? 'Edit this button' : 'Hide this built-in button (bring it back in usefulQueries settings)'"
                  @click="editOrHide(b)"
                >{{ b.isUser ? "✎" : "✕" }}</cdx-button>
              </span>
            </teleport>
          </template>
        `,
    });

    app.component("CdxButton", Codex.CdxButton);
    if (Codex.CdxPopover) {
      app.component("CdxPopover", Codex.CdxPopover);
    }
    app.component("UsefulQueriesPopover", UsefulQueriesPopover);
    app.mount(mountPoint);
    _mounted.app = app;
    _mounted.mountPoint = mountPoint;
  });
}
