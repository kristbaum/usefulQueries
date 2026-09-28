# Writing usefulQueries templates — guide for LLM agents

This file is self-contained. You could optionally give it to an LLM agent  (only really works if they have access to Wikidata, e.g via this https://wd-mcp.wmcloud.org/ )
together with a request like *"On painters, add a button that maps where their
works are kept"*, and it should have everything it needs to produce a working
template. It is also the reference for humans writing templates by hand.

**usefulQueries** is a MediaWiki user script for Wikidata (and other Wikibase
instances). On an item page it looks at the item's statements and adds small
emoji buttons: *query buttons* open a SPARQL result in a popup, *link buttons*
open an external tool. Each button is defined by one JSON file — a *template*.
Writing a new button means writing one such file; no JavaScript is involved.

## Workflow for the agent

1. **Pin down the question.** What does the user want to see, and on which kind
   of item (painters, buildings, cities, …)? If the request is ambiguous, ask.
2. **Choose where the button hangs** — the `scope`. This is the most common
   mistake; read [Choosing the scope](#choosing-the-scope) before writing
   anything.
3. **Look up every ID.** Find the property and item IDs with a search tool or
   the Wikidata API. Never write a PID or QID from memory — a plausible-looking
   wrong ID produces a button that silently never appears or a query that
   returns nothing.
4. **Check how the data is modelled.** Look at two or three real items: which
   property actually carries the relation, in which direction, and how well it
   is populated. A query over a property almost nobody uses is not useful.
5. **Write the SPARQL** following [the query rules](#writing-the-sparql).
6. **Run it** on the Wikidata Query Service with the placeholders filled in by
   hand exactly as the script would fill them (see
   [Placeholders](#placeholders)). Pick an `example` item where it returns
   something, and make sure it finishes well inside the 60 s limit.
7. **Hand over the JSON file** and say where it goes (see
   [Installing a template](#installing-a-template)).

## Choosing the scope

`scope` decides where the button is attached. There are three:

| scope | Button sits next to | Shown when |
| ----- | ------------------- | ---------- |
| `entity` | the item title | always, on every item |
| `property` | the property label (once per property) | the item has a statement for one of `propertyId` |
| `value` | each individual statement value | the statement's property is in `propertyId`, and — if `valueId` is set — its value is in `valueId` |

The rule for choosing between `property` and `value`:

> **If the result depends on which value was clicked, the button belongs on the
> value.** Only a query that uses *all* of the property's values together, or
> *none* of them, belongs on the property.

A query that reads the property's values back out of the item —
`wd:{itemQid} wdt:P276 ?building` — is a per-value query in disguise. On an
item with two locations, it silently merges both into one answer and shows a
single button for it. Put it on `value` scope and use `{valueQid}` instead; an
item with two locations then gets two buttons, each answering for its own
statement:

```sparql
    # wrong: property scope, reads every location of the item
    wd:{itemQid} wdt:P276 ?building.
    ?sibling wdt:P276 ?building.

    # right: value scope, uses the location the button sits next to
    ?sibling wdt:P276 wd:{valueQid}.
```

This works for every datatype, not only items — see
[Placeholders](#placeholders) for what `{valueQid}` expands to on a string,
date or coordinate.

The three legitimate patterns, with shipped examples:

| Pattern | scope | Query uses | Example |
| ------- | ----- | ---------- | ------- |
| **Per value** — the answer is about the clicked value | `value`, usually no `valueId` | `{valueQid}` (and often `{valueLabel}` in the title) | `birthPlacePeople` on P19: other people born in *this* place. `memberList` on P463: members of *this* organisation |
| **Value as a gate** — the value only decides *whether* the button appears; the query is about the item itself | `value` with `valueId` | `{itemQid}` only | `artistTimeline` on P106 = painter: the query is about the painter, but only painters should get the button |
| **All or none of the values** — the query aggregates across every value, or uses the property only as a hint that the item is of the right kind | `property` | `{itemQid}` only | `positionTimeline` on P6/P35/…: every office-holder in one timeline. `countsOverTime` on P1082/P2124/P2196: all series in one chart |

The gate pattern is the one exception to "per value → value scope": property
scope has no `valueId` filter, so a button meant only for humans
(`P31` = `Q5`) or only for painters (`P106` = `Q1028181`) has to be a value
button even though its query never reads `{valueQid}`.

Use `entity` only for queries that make sense on *every* item (e.g. a generic
graph of the item's statements) — they appear on all pages.

`valueId` matching is exact: it compares the statement's value with the list,
with no subclass reasoning. To catch "any kind of church", list the classes
that actually occur in the data.

## Query template (`templates/queries/*.json`)

```json
{
  "id": "birthPlacePeople",
  "example": "Q42",
  "scope": "value",
  "propertyId": [
    "P19"
  ],
  "valueId": null,
  "template": [
    "#defaultView:ImageGrid",
    "SELECT ?person ?personLabel ?image ?sitelinks WHERE {",
    "  ?person wdt:P19 wd:{valueQid};",
    "    wdt:P18 ?image;",
    "    wikibase:sitelinks ?sitelinks.",
    "  SERVICE wikibase:label { bd:serviceParam wikibase:language \"[AUTO_LANGUAGE],mul,en\". }",
    "}",
    "ORDER BY DESC(?sitelinks)",
    "LIMIT 100"
  ],
  "emoji": "👶",
  "title": "Best-known people born in {valueLabel}"
}
```

| Field | Type | Description |
| ----- | ---- | ----------- |
| `id` | string | Identifier, usually the file name without `.json`. Documentation only; nothing reads it at runtime |
| `example` | string | QID of an item where the button appears **and** the query returns something. Not shipped in the script; used for testing and listed in the on-wiki overview |
| `scope` | `"entity"` \| `"property"` \| `"value"` | Where the button hangs — see above |
| `propertyId` | string[] | Property IDs that trigger the button. Required for `property`/`value`, forbidden for `entity`. Always an array |
| `valueId` | string[] \| null | `value` scope only: item QIDs the value must equal. Omit or `null` to match any value |
| `template` | string[] | The SPARQL query, **one line per array entry** (joined with `\n`). A single string is rejected |
| `emoji` | string | Button label, one emoji |
| `title` | string | Button tooltip and popup heading; supports placeholders |

The first line may be a result view such as `#defaultView:Map`,
`#defaultView:Timeline`, `#defaultView:Graph`, `#defaultView:LineChart` or
`#defaultView:ImageGrid`. Plain `#` comment lines are allowed and encouraged —
use them to say what question the query answers and why it is shaped the way it
is.

## Link template (`templates/links/*.json`)

```json
{
  "id": "entitree",
  "example": "Q9682",
  "scope": "property",
  "propertyId": [
    "P22",
    "P25",
    "P3373",
    "P26",
    "P40",
    "P1038",
    "P3448",
    "P8810"
  ],
  "urlTemplate": "https://entitree.com/{userLanguage}/family_tree/{itemQid}",
  "emoji": "🌳",
  "title": "Family tree on Entitree"
}
```

Same fields as a query template, except `urlTemplate` (an absolute `http(s)`
URL, placeholders allowed) replaces `template`. The link opens in a new tab.

## Placeholders

Replaced at runtime in `template`, `title` and `urlTemplate`:

| Placeholder | Available on | Expands to |
| ----------- | ------------ | ---------- |
| `{itemQid}` | all scopes | QID of the current item, e.g. `Q454172` — write `wd:{itemQid}` |
| `{itemLabel}` | all scopes | the item's label in the user's language |
| `{userLanguage}` | all scopes | the user's interface language code, e.g. `de` |
| `{propertyPid}` | `property`, `value` | the PID the button hangs off, e.g. `P54` — write `wdt:{propertyPid}` |
| `{valueQid}` | `value` | the clicked value, in SPARQL syntax — see below |
| `{valueLabel}` | `value` | a human-readable form of the value, for titles |
| `{valueLat}` / `{valueLon}` | `value` | latitude/longitude, only on globe-coordinate values (P625); empty otherwise |

Despite its name, `{valueQid}` is filled for every datatype, already formatted
as a SPARQL term:

| Value datatype | `{valueQid}` | `{valueLabel}` | Use in SPARQL as |
| -------------- | ------------ | -------------- | ---------------- |
| item / property | `Q1726` | the item's label | `wd:{valueQid}` |
| string, external ID | `"91E23"` (quotes included) | `91E23` | `{valueQid}` — **no** extra quotes |
| time | `"+1685-00-00T00:00:00Z"^^xsd:dateTime` | the raw timestamp | `{valueQid}` |
| quantity | `+1234` | `+1234` | `{valueQid}` |
| globe coordinate | `"Point(11.5 48.1)"^^geo:wktLiteral` | `48.1, 11.5` | `{valueQid}`, or build your own point from `{valueLat}` / `{valueLon}` |

Other datatypes (monolingual text, …) and statements with *no value* /
*unknown value* never get a value button.

A radius search around a coordinate value:

```sparql
    SERVICE wikibase:around {
      ?place wdt:P625 ?coordinates.
      bd:serviceParam wikibase:center "Point({valueLon} {valueLat})"^^geo:wktLiteral.
      bd:serviceParam wikibase:radius "15".
      bd:serviceParam wikibase:distance ?distanceKm.
    }
```

### Querying the matched property (`{propertyPid}`)

A template can list several `propertyId`s, and `{propertyPid}` tells the query
which one the clicked button actually hangs off. Use it when the trigger
property *is* the relation being queried — then one template covers a family of
properties without a `UNION` arm per member, and the query stays a single
triple pattern:

```sparql
    # memberList: one arm, whichever of the six member properties fired
    ?member wdt:{propertyPid} wd:{valueQid}.
```

It also keeps the query out of the one pattern that does not scale. A `LIMIT`ed
scan of a single `wdt:` pattern, or of `UNION` arms, terminates early; the
property-path alternation `(wdt:P54|wdt:P102|…)` is materialised first. Fetching
300 members of a six-figure membership (P102 → Nazi Party):

| member scan | time |
| ------------- | ------ |
| `?member wdt:{propertyPid} wd:{valueQid}.` | 0.4 s |
| six `UNION` arms | 0.3 s |
| `VALUES ?prop` + variable predicate | 0.5 s |
| six-way property path | 2.0–2.7 s, once a 90 s timeout |

So the placeholder is mainly about precision and a smaller template — the
`UNION` form is no slower. What *does* decide whether the query finishes is how
many members reach the `OPTIONAL`s and the label service, which is why
`memberList` caps them in a subselect first. Same query, P463 → Royal Society,
measured back to back: 11 s at `LIMIT 200`, 14 s at 300, 40 s at 500, against a
60 s WDQS ceiling.
Note that WDQS timings swing by an order of magnitude with server load, and a
timed-out response is cached and replayed instantly — vary the query (a comment
is enough) when re-measuring.

Also mind that `VALUES ?prop { … } ?member ?prop wd:Q…` is not just slow but
wrong inside a subselect: Blazegraph returned the *predicates* in `?member`.

Do **not** reach for it when a multi-property template deliberately aggregates
*across* its properties: `positionTimeline` wants every office in one timeline
and `countsOverTime` wants population, members and students in one chart, so
both keep their hardcoded `VALUES` lists. The test is whether the other
properties belong in the same result set — if they do, hardcode them; if the
button should answer only for the statement it sits on, use `{propertyPid}`.

It is unset on `entity` scope (the validator rejects it there), and it expands
to a bare PID (`P54`), so it needs its `wdt:` / `p:` prefix written in the
template.

## Writing the SPARQL

Every query is run on the Wikidata Query Service (WDQS, Blazegraph) and is
also offered as a link to QLever. Both speak SPARQL 1.1 but plan it very
differently, so a query can be instant on one and time out on the other.

The first three rules are enforced by the build and fail it; the rest need a
human and a stopwatch.

**Never put two unconnected patterns in one `OPTIONAL`.** If the patterns in an
`OPTIONAL` body share no variable with each other, write one `OPTIONAL` per
pattern:

```sparql
    # times out on QLever - cross product of two 6M-row relations
    OPTIONAL { ?node wdt:P18 ?nodeImage. ?childNode wdt:P18 ?childImage. }

    # fine on both
    OPTIONAL { ?node wdt:P18 ?nodeImage. }
    OPTIONAL { ?childNode wdt:P18 ?childImage. }
```

Blazegraph evaluates the block per row of the left side, so the joint form costs
it nothing. QLever evaluates the body as its own subtree first and materialises
the product. The two forms are not equivalent — the joint one is all-or-nothing
— so pick the split form deliberately, and only when binding either variable on
its own is acceptable. It usually is.

**Hoist shared lookups out of `UNION` arms.** If each arm carries its own
`OPTIONAL` for the same lookup, move one copy below the `UNION` instead. It
covers every arm, halves the pattern count, and removes the temptation to bolt a
joint `OPTIONAL` on the end to fill the gaps. (The build rejects the same
`OPTIONAL` body appearing twice.)

**Keep `SERVICE wikibase:label` as the last pattern of the WHERE clause.** The
QLever converter rewrites it into `OPTIONAL { ?x rdfs:label ?xLabel. FILTER(LANG(...)) }`
blocks and places them well only when it can see what binds each variable.

Also:

- **Always set a `LIMIT`**, typically 100–400. The popup is for browsing, not
  export.
- **Cap before you decorate.** If the core pattern can match many rows, select
  and `LIMIT` them in a subselect, then add `OPTIONAL`s and labels outside it.
  The cost is driven by how many rows reach the `OPTIONAL`s and the label
  service.
- **Constrain the subject before an unbounded `?s ?p ?o` scan.** An entity with
  many statements can push such a query past the WDQS 60 s limit even when
  QLever answers in milliseconds.
- **Avoid property-path alternation** `(wdt:P1|wdt:P2)` on large relations —
  use `UNION` or `{propertyPid}` instead (see above).
- **Test the `example` value, not just the template.** A template that is
  correct for a small item can still time out on the example shipped with it —
  and on the biggest items it will be clicked on (a capital city, a major
  organisation).
- Prefer `wdt:` (best-rank truthy values). Use `p:`/`ps:`/`pq:` only when you
  need qualifiers such as start/end time.
- Select `?xLabel` for every item column you show, and an image (`P18`) column
  for `ImageGrid`, a `P625` coordinate column for `Map`, a date column for
  `Timeline`. Graph views need `?node`/`?childNode` style columns — copy an
  existing graph template.

## Validation

The build validates every template and refuses to build, listing each problem,
if any is malformed:

- Unknown fields are rejected — this catches typos and field names from older
  revisions (`popupTitle`, `toolhint`, `enabled` are all gone).
- `scope` must be one of the three values; `propertyId` / `valueId` must be
  present or absent as described above, and look like `P123` / `Q123`.
- `template` must be a non-empty array of strings; `urlTemplate` must be an
  absolute `http(s)` URL.
- `example` must be a QID.
- Every `{placeholder}` must be a known name available on the template's
  scope — `{valueQid}` on a `property` template is an error.
- The three SPARQL rules above.

The validator cannot tell whether a *valid* template uses the right scope. That
is the job of the checklist below.

## Checklist before handing over

- [ ] Every PID and QID was looked up, not recalled.
- [ ] Scope follows the rule: result depends on the clicked value → `value`
      with `{valueQid}`; value only gates the button → `value` + `valueId`;
      uses all or none of the values → `property`.
- [ ] No `wd:{itemQid} wdt:<trigger property> ?x` on a `property` template
      unless the query really means *all* values together.
- [ ] String/external-ID values are used as `{valueQid}`, not `"{valueQid}"`.
- [ ] The query ran on WDQS with the placeholders filled in for `example`, and
      returned rows in well under 60 s.
- [ ] There is a `LIMIT`; the label service is the last pattern; no joint
      `OPTIONAL`s over unconnected patterns.
- [ ] The `title` says what the result is and names the value
      (`{valueLabel}`) or the item (`{itemLabel}`) it is about.

## Installing a template

The script is built from a checkout of the repository
(<https://github.com/kristbaum/usefulQueries>) with Node.js:

```bash
npm install
# put the file in templates/queries/ (or templates/links/), then:
npm run build && npm test
```

Upload the resulting `minified_usefulQueries.js` to a user JS page on Wikidata and
load it from [your `common.js`](https://www.wikidata.org/wiki/Special:MyPage/common.js)
— the README has the step-by-step setup.

For a personal or project-specific set of buttons, use a custom variant instead
of editing the shared templates: create `MyQueries/settings.json` (copy
`src/settings.json`) and `MyQueries/templates/queries/`, put the template
there, and run `node scripts/assemble.mjs --custom MyQueries`. The output lands
in `MyQueries/minified_MyQueries_usefulQueries.js`. The `Deckenmalerei/` and
`ReSaNode/` folders are worked examples.

When browsing for a template to copy, the existing ones under
`templates/queries/` cover most shapes: maps (`namedAfterMap`), timelines
(`artistTimeline`), graphs (`employerGraph`), tables (`memberList`) and radius
searches (`Deckenmalerei/templates/queries/corpusNearbySites.json`).
