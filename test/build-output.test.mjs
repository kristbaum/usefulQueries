import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import vm from "node:vm";

const repoRoot = path.resolve(process.cwd());

// The two assembled artifacts produced by `npm run build`. These are the files
// actually served to MediaWiki, so they must always be valid, runnable JS.
const OUTPUTS = [
  { name: "usefulQueries.js", minified: false },
  { name: "minified_version.js", minified: true },
];

/**
 * Build a sandbox that stubs just enough of the MediaWiki/jQuery runtime for the
 * script's top-level code to execute. `$(fn)` (jQuery DOM-ready) invokes the
 * callback immediately, and `mw.config.get` reports a namespace that does NOT
 * match SETTINGS.allowedNamespace (0), so the script takes its early-return
 * path without touching the DOM. This verifies the IIFE actually runs rather
 * than only parsing.
 */
function makeSandbox() {
  const state = { readyRan: false };
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    state,
    $: (arg) => {
      if (typeof arg === "function") {
        state.readyRan = true;
        arg();
      }
      return { ready: () => {} };
    },
    mw: {
      // Non-zero namespace => not the main namespace => script returns early.
      config: { get: () => 1 },
      loader: { using: () => Promise.resolve(), load: () => {} },
      util: {},
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  return { sandbox, state };
}

for (const { name } of OUTPUTS) {
  const filePath = path.join(repoRoot, name);

  test(`${name}: exists and is non-empty`, async () => {
    const code = await readFile(filePath, "utf8");
    assert.ok(code.trim().length > 0, `${name} should not be empty`);
  });

  test(`${name}: parses as valid JavaScript`, async () => {
    const code = await readFile(filePath, "utf8");
    // vm.Script compiles (parses) the source and throws SyntaxError if invalid.
    assert.doesNotThrow(
      () => new vm.Script(code, { filename: name }),
      `${name} should be syntactically valid JavaScript`,
    );
  });

  test(`${name}: executes top-level code without throwing`, async () => {
    const code = await readFile(filePath, "utf8");
    const { sandbox, state } = makeSandbox();
    const script = new vm.Script(code, { filename: name });
    assert.doesNotThrow(
      () => script.runInNewContext(sandbox, { timeout: 5000 }),
      `${name} should run its IIFE without throwing`,
    );
    assert.ok(
      state.readyRan,
      `${name} should register and run a jQuery ready callback`,
    );
  });
}
