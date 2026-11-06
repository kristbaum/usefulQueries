// Runs the built script against a stubbed MediaWiki: as an item page (logged
// out and logged in with a config page) and as the settings page. The stubs
// are shallow — this catches ReferenceErrors and broken wiring between the
// src/ files, not rendering bugs (Codex never "loads" here).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

const repoRoot = path.resolve(import.meta.dirname, "..");

/** A jQuery-ish object on which every method returns itself. */
function chain() {
  const proxy = new Proxy(function () {}, {
    get: (_, prop) => {
      if (prop === "length") return 0;
      if (prop === "then" || typeof prop === "symbol") return undefined;
      if (prop === "text") return (arg) => (arg === undefined ? "" : proxy);
      return () => proxy;
    },
    apply: () => proxy,
  });
  return proxy;
}

function makeSandbox({ config, configPage = null }) {
  const state = { spans: 0, hooks: [], portlets: [], apiCalls: [], errors: [] };
  const never = new Promise(() => {});
  const $ = function (arg) {
    if (typeof arg === "function") {
      arg();
      return chain();
    }
    return chain();
  };
  $.Deferred = () => {
    let reject;
    const p = new Promise((_, r) => (reject = r));
    return { reject: (v) => (reject(v), { promise: () => p }), promise: () => p };
  };
  $.when = (p) => p;

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    URL,
    CSS: { escape: (s) => s },
    $,
    document: {
      title: "",
      createElement: (tag) => {
        if (tag === "span") state.spans++;
        return { className: "", remove() {}, isConnected: true };
      },
      body: { appendChild() {} },
    },
    mw: {
      config: { get: (key) => config[key] },
      hook: () => ({ add: (fn) => state.hooks.push(fn) }),
      loader: {
        // Codex never resolves, so rendering stops before Vue would run.
        using: (mods) =>
          [].concat(mods).includes("@wikimedia/codex") ? never : Promise.resolve(),
        load() {},
      },
      util: {
        addPortletLink: (...args) => (state.portlets.push(args[3]), null),
        getUrl: (t) => "/wiki/" + t,
        getParamValue: () => null,
        addCSS() {},
      },
      notify: (msg) => state.errors.push(msg),
      Api: function () {
        return {
          get: (params) => {
            state.apiCalls.push(params);
            return Promise.resolve({
              query: {
                pages: [
                  configPage === null
                    ? { missing: true }
                    : { revisions: [{ slots: { main: { content: configPage } } }] },
                ],
              },
            });
          },
        };
      },
    },
  };
  sandbox.window = sandbox;
  return { sandbox, state };
}

const flush = () => new Promise((r) => setImmediate(r));

async function run(options) {
  const code = await readFile(path.join(repoRoot, options.file), "utf8");
  const { sandbox, state } = makeSandbox(options);
  new vm.Script(code, { filename: options.file }).runInNewContext(sandbox, { timeout: 5000 });
  for (let i = 0; i < 5; i++) await flush();
  return state;
}

async function fireEntity(state) {
  for (const fn of state.hooks) fn({ type: "item", id: "Q1", claims: {} });
  for (let i = 0; i < 5; i++) await flush();
}

const itemPage = {
  wgNamespaceNumber: 0,
  wgUserLanguage: "en",
  wgPageName: "Q1",
  wgTitle: "Q1",
};

const userConfig = JSON.stringify({
  version: 1,
  disabled: [],
  seen: [],
  queries: [
    {
      id: "u_mine",
      example: "Q1",
      scope: "entity",
      template: ["SELECT ?x WHERE { wd:{itemId} ?p ?x }"],
      emoji: "⭐",
      title: "Mine",
    },
  ],
  links: [],
});

for (const file of ["usefulQueries.js", "minified_usefulQueries.js"]) {
  test(`${file}: item page, logged out`, async () => {
    const state = await run({ file, config: { ...itemPage, wgUserName: null } });
    assert.equal(state.apiCalls.length, 0, "no config request for logged-out visitors");
    assert.equal(state.hooks.length, 1);
    await fireEntity(state);
    assert.ok(state.spans > 0, "entity-level buttons get slots");
    assert.deepEqual(state.portlets, []);
  });

  test(`${file}: item page, logged in with a config page`, async () => {
    const loggedOut = await run({ file, config: { ...itemPage, wgUserName: null } });
    await fireEntity(loggedOut);

    const state = await run({
      file,
      config: { ...itemPage, wgUserName: "Example" },
      configPage: userConfig,
    });
    assert.equal(state.apiCalls[0].titles, "User:Example/usefulQueries.json");
    await fireEntity(state);
    assert.equal(state.spans, loggedOut.spans + 1, "the user's entity button is added");
    assert.deepEqual(state.errors, [], "a valid config raises no notice");
    assert.ok(state.portlets.some((id) => id.startsWith("t-usefulqueries-edit-")));
    assert.ok(state.portlets.some((id) => id.startsWith("t-usefulqueries-settings-")));
  });

  test(`${file}: a broken config page falls back to the built-ins`, async () => {
    const state = await run({
      file,
      config: { ...itemPage, wgUserName: "Example" },
      configPage: "{ not json",
    });
    await fireEntity(state);
    assert.ok(state.spans > 0);
    assert.equal(state.errors.length, 1, "one notice about the broken config");
  });

  test(`${file}: settings page renders without touching items`, async () => {
    const state = await run({
      file,
      config: {
        wgNamespaceNumber: -1,
        wgCanonicalSpecialPageName: "Blankpage",
        wgPageName: "Special:BlankPage/usefulQueries",
        wgTitle: "BlankPage/usefulQueries",
        wgUserName: null,
      },
    });
    assert.equal(state.hooks.length, 0, "no entity hook on the settings page");
  });

  test(`${file}: other special pages are left alone`, async () => {
    const state = await run({
      file,
      config: {
        wgNamespaceNumber: -1,
        wgCanonicalSpecialPageName: "Blankpage",
        wgPageName: "Special:BlankPage/somethingElse",
        wgTitle: "BlankPage/somethingElse",
        wgUserName: "Example",
      },
    });
    assert.equal(state.hooks.length, 0);
    assert.equal(state.apiCalls.length, 0);
  });
}
