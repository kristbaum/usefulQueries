// ===== UI CREATION FUNCTIONS =====

/**
 * Create a Codex button with a link
 * @param {jQuery} element - The element to append the button to
 * @param {string} url - The URL to open when clicked
 * @param {string} buttonLabel - The label (emoji/text) for the button
 * @param {string} toolhint - The tooltip for the button
 */
function createLinkButton(element, url, buttonLabel, toolhint) {
  mw.loader.using("@wikimedia/codex").then(function (require) {
    const Vue = require("vue");
    const Codex = require("@wikimedia/codex");

    const mountPoint = document.createElement("span");
    $(element).append(mountPoint);

    const app = Vue.createMwApp({
      name: "UsefulQueriesLinkButton",
      data: function () {
        return { url, buttonLabel, toolhint };
      },
      template: `
          <a :href="url" target="_blank" rel="noopener noreferrer" :title="toolhint" style="text-decoration: none;">
            <cdx-button weight="quiet" action="progressive" :aria-label="toolhint">
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
 * @param {string} toolhint - The tooltip for the button
 * @param {string} toplabel - The title for the popup
 */
function createQueryPopup(
  element,
  querystring,
  buttonLabel,
  toolhint,
  toplabel,
) {
  mw.loader.using("@wikimedia/codex").then(function (require) {
    const Vue = require("vue");
    const Codex = require("@wikimedia/codex");

    const mountPoint = document.createElement("span");
    $(element).append(mountPoint);

    const widthWithMin = Math.max(window.screen.width / 2, 800);
    const queryServiceHref = SETTINGS.queryServiceUrl + querystring;
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
          toolhint,
          toplabel,
          queryServiceHref,
          embedHref,
          qleverHref,
          iframeSize: widthWithMin,
        };
      },
      mounted: function () {
        this.anchorEl = this.$refs.triggerEl || null;
      },
      template: `
          <span ref="triggerEl">
            <cdx-button
              :href="queryServiceHref"
              target="_blank"
              rel="noopener noreferrer"
              weight="quiet"
              action="progressive"
              :aria-label="toolhint"
              :title="toolhint"
              @click.prevent="open = !open"
            >
              {{ buttonLabel }}
            </cdx-button>
          </span>

          <cdx-popover
            v-if="anchorEl"
            v-model:open="open"
            :anchor="anchorEl"
            placement="bottom-start"
            :render-in-place="true"
            :title="toplabel"
            :use-close-button="true"
          >
            <div>
              <div v-if="qleverHref" style="padding: 10px; border-bottom: 1px solid;">
                <a :href="qleverHref" target="_blank" rel="noopener noreferrer">
                  Run query on QLever (alternative query service)
                </a>
              </div>
              <iframe
                v-if="open"
                scrolling="yes"
                frameborder="0"
                :src="embedHref"
                :width="iframeSize"
                :height="iframeSize"
              ></iframe>
            </div>
          </cdx-popover>
        `,
    });

    app.component("CdxButton", Codex.CdxButton);
    app.component("CdxPopover", Codex.CdxPopover);
    app.mount(mountPoint);
  });
}
