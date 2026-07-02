import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

// The source under src/, framework.js, scripts/ and templates/ are intermediate
// build inputs (fragments assembled by scripts/assemble.mjs) and do not lint
// cleanly in isolation. Lint only the assembled output that ships to MediaWiki.
export default defineConfig([
  {
    ignores: [
      "src/**",
      "scripts/**",
      "templates/**",
      "test/**",
      "framework.js",
      "eslint.config.mjs",
    ],
  },
  {
    files: ["usefulQueries.js", "minified_version.js"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: {
      globals: {
        ...globals.browser,
        $: "readonly",
        jQuery: "readonly",
        mw: "readonly",
        Vue: "readonly",
        wikibase: "readonly",
      },
    },
  },
]);
