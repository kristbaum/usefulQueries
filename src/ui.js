// ===== UI CREATION FUNCTIONS =====

// Buttons are collected while the claims are processed and rendered together
// by mountButtons(): one Vue app per build instead of one per button.
const _pendingButtons = [];

/**
 * Append an empty slot to an anchor element; the button is teleported into it
 * later, so it keeps its position among the other buttons on that anchor.
 * @param {jQuery} element - The element to append the slot to
 * @returns {HTMLElement} The slot element
 */
function addButtonSlot(element) {
  const slot = document.createElement("span");
  $(element).append(slot);
  return slot;
}

/**
 * Queue a Codex button with a link
 * @param {jQuery} element - The element to append the button to
 * @param {string} url - The URL to open when clicked
 * @param {string} buttonLabel - The label (emoji/text) for the button
 * @param {string} title - The tooltip for the button
 */
function createLinkButton(element, url, buttonLabel, title) {
  _pendingButtons.push({
    kind: "link",
    slot: addButtonSlot(element),
    url,
    buttonLabel,
    title,
  });
}

/**
 * Queue a Codex popup button with an embedded query
 * @param {jQuery} element - The element to append the popup button to
 * @param {string} querystring - The encoded query string
 * @param {string} buttonLabel - The label (emoji/text) for the button
 * @param {string} title - The tooltip and popup heading
 * @param {string} scope - Template scope ("entity", "property", or "value")
 */
function createQueryPopup(
  element,
  querystring,
  buttonLabel,
  title,
  scope,
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
  if (!_pendingButtons.length) return;
  const buttons = _pendingButtons.splice(0);

  mw.loader.using("@wikimedia/codex").then(function (require) {
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

    const mountPoint = document.createElement("div");
    mountPoint.hidden = true;
    document.body.appendChild(mountPoint);

    const app = Vue.createMwApp({
      name: "UsefulQueriesButtons",
      data: function () {
        return {
          // Static list holding DOM nodes; keep Vue from proxying it.
          buttons: Vue.markRaw(buttons),
          iframeSize: Math.min(Math.max(window.innerWidth - 40, 400), 800),
        };
      },
      template: `
          <template v-for="(b, i) in buttons" :key="i">
            <teleport :to="b.slot">
              <a
                v-if="b.kind === 'link'"
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
  });
}
