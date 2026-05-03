// ===== UI CREATION FUNCTIONS =====

/**
 * Create a Codex button with a link
 * @param {jQuery} element - The element to append the button to
 * @param {string} url - The URL to open when clicked
 * @param {string} buttonLabel - The label (emoji/text) for the button
 * @param {string} title - The tooltip for the button
 */
function createLinkButton(element, url, buttonLabel, title) {
  mw.loader.using("@wikimedia/codex").then(function (require) {
    const Vue = require("vue");
    const Codex = require("@wikimedia/codex");

    const mountPoint = document.createElement("span");
    $(element).append(mountPoint);

    const app = Vue.createMwApp({
      name: "UsefulQueriesLinkButton",
      data: function () {
        return { url, buttonLabel, title };
      },
      template: `
          <a :href="url" target="_blank" rel="noopener noreferrer" :title="title" style="text-decoration: none;">
            <cdx-button weight="quiet" action="progressive" :aria-label="title">
              {{ buttonLabel }}
            </cdx-button>
          </a>
        `,
    });

    app.component("CdxButton", Codex.CdxButton);
    app.mount(mountPoint);
  });
}

/**
 * Create a Codex popup button with an embedded query
 * @param {jQuery} element - The element to append the popup button to
 * @param {string} querystring - The encoded query string
 * @param {string} buttonLabel - The label (emoji/text) for the button
 * @param {string} title - The tooltip and popup heading
 */
function createQueryPopup(
  element,
  querystring,
  buttonLabel,
  title,
) {
  const queryServiceHref = SETTINGS.queryServiceUrl + querystring;

  mw.loader.using("@wikimedia/codex").then(function (require) {
    const Vue = require("vue");
    const Codex = require("@wikimedia/codex");

    if (!Codex.CdxPopover) {
      // Older Codex versions (e.g. some Wikibase Cloud instances) lack CdxPopover;
      // fall back to a plain link button to avoid rendering the component inline.
      createLinkButton(element, queryServiceHref, buttonLabel, title);
      return;
    }

    const mountPoint = document.createElement("span");
    $(element).append(mountPoint);

    mw.util.addCSS(".usefulqueries-popover { max-width: none !important; }");

    const widthWithMin = Math.min(Math.max(window.innerWidth - 40, 400), 800);
    const embedHref = SETTINGS.queryEmbedUrl + querystring;
    /* __IF_QLEVER__ */
    const qleverHref = getQLeverUrl(querystring);
    /* __ENDIF_QLEVER__ */
    /* __IF_NOT_QLEVER__ */
    const qleverHref = null;
    /* __ENDIF_NOT_QLEVER__ */

    const app = Vue.createMwApp({
      name: "UsefulQueriesPopover",
      data: function () {
        return {
          open: false,
          anchorEl: null,
          buttonLabel,
          title,
          queryServiceHref,
          embedHref,
          qleverHref,
          iframeSize: widthWithMin,
          primaryAction: {
            label: "Open in query service",
            actionType: "progressive",
          },
          defaultAction: qleverHref ? { label: "Open in QLever" } : null,
        };
      },
      mounted: function () {
        this.anchorEl = this.$refs.triggerEl || null;
      },
      methods: {
        openQueryService: function () {
          window.open(this.queryServiceHref, "_blank", "noopener,noreferrer");
        },
        openQLever: function () {
          if (this.qleverHref) {
            window.open(this.qleverHref, "_blank", "noopener,noreferrer");
          }
        },
      },
      template: `
          <span ref="triggerEl">
            <cdx-button
              weight="quiet"
              action="progressive"
              :aria-label="title"
              :title="title"
              @click="$event.preventDefault(); open = !open"
            >
              {{ buttonLabel }}
            </cdx-button>
          </span>

          <cdx-popover
            v-if="anchorEl"
            v-model:open="open"
            :anchor="anchorEl"
            placement="bottom"
            :render-in-place="false"
            :title="title"
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
              :src="embedHref"
              :width="iframeSize"
              :height="iframeSize"
            ></iframe>
          </cdx-popover>
        `,
    });

    app.component("CdxButton", Codex.CdxButton);
    app.component("CdxPopover", Codex.CdxPopover);
    app.mount(mountPoint);
  });
}
