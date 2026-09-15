# Deckenmalerei — a usefulQueries variant for the Baroque ceiling painting corpus

A custom build of [usefulQueries](../README.md) aimed at the items documented in
the *Corpus der barocken Deckenmalerei in Deutschland* (CbDD), which are marked
on Wikidata with [deckenmalerei.eu ID (P10626)](https://www.wikidata.org/wiki/Property:P10626).

It targets Wikidata itself, not a separate Wikibase — the settings are the stock
Wikidata ones. The variant exists to ship a *different set of buttons*, tuned to
the three kinds of item this corpus is built from: ceiling paintings, the
buildings that hold them, and the painters and patrons behind them.

## Build

```bash
node scripts/assemble.mjs --custom Deckenmalerei
```

Writes `usefulDeckenmalereiQueries.js` and `minified_Deckenmalerei_version.js`
into this folder. Upload the minified file to your Wikidata user JS page.

## The two families of query

Every query here falls into one of two groups, and the group is stated in the
button tooltip so it is never ambiguous which one you are looking at.

### 🏛️ CbDD corpus only — `corpus*.json`

These carry `?x wdt:P10626 []` somewhere in the pattern, so they only ever return
items that are part of the corpus. Use them to read the corpus as a closed,
consistently catalogued world: comparable material, comparable depth of
description, no outside noise.

The restriction is not only about tidiness — for some questions it is what makes
the answer correct at all. `corpusArtistCollaborators` is the clearest case.
"Which other painters worked in the same buildings as this one?" sounds like it
needs no filter, but `location (P276)` is also how a painting records the museum
it hangs in. Without the corpus limit, one Asam panel in a picture gallery drags
in that gallery's entire holdings, and the answer comes back claiming Cosmas
Damian Asam collaborated with Picasso, Rembrandt and Joan Miró. With the limit,
the same query returns his father Hans Georg Asam, his brother Egid Quirin Asam,
and Nikolaus Gottfried Stuber.

| File | Shown on | Answers |
| ---- | -------- | ------- |
| `corpusIconclassSiblings` | an Iconclass statement | where else this theme was painted on a ceiling, on a map |
| `corpusSameBuildingProgramme` | a painting's location | the rest of the painted cycle in the same building |
| `corpusBuildingPaintings` | a building | every documented ceiling inside it, oldest first |
| `corpusNearbySites` | a coordinate | painted ceilings within 30 km, by distance |
| `corpusArtistItinerary` | a person | the sites they actually worked at, mapped |
| `corpusArtistCollaborators` | a person | painters documented in the same houses |
| `corpusPatronCommissions` | a "commissioned by" statement | everything else that patron paid for in the corpus |

### 🌍 All of Wikidata — `open*.json`

These deliberately omit the `P10626` filter. They start from the same item but
follow the connection out of the corpus and into the rest of Wikidata — panel
paintings in museum collections, prints, unsurveyed monuments, building
campaigns that were never about ceilings at all.

Each one selects a `?cbddId` column that stays empty for anything outside the
corpus. That column is the point: it shows at a glance how much of a theme, an
oeuvre or a landscape the corpus has actually covered, and what is still open.

| File | Shown on | Answers |
| ---- | -------- | ------- |
| `openIconclassAnywhere` | an Iconclass statement | the same theme across all of Wikidata, with collections |
| `openCreatorWorks` | a person | the complete recorded oeuvre, not just ceilings |
| `openNearbyHeritage` | a coordinate | every listed monument within 15 km, surveyed or not |
| `openPatronCommissions` | a "commissioned by" statement | the patron's full building campaign |

Four of the seven corpus queries have an open counterpart on the same trigger
(Iconclass, person, coordinate, patron), so the two can be run back to back on
one item and compared directly.

## How the buttons are triggered

`scope` and `propertyId` decide where a button appears — see the template format
in [AGENTS.md](../AGENTS.md).

- **Paintings** are reached through the statements that matter for them:
  `P1257` (Iconclass), `P276` (location), `P88` (commissioned by). Attaching to
  the statement rather than the item puts the button next to the data it explains.
- **People** are matched with `scope: "value"` on `P31` = `Q5`.
- **Buildings** are matched with `scope: "value"` on `P31` against a list of the
  building classes that actually occur in the corpus — château, royal palace,
  church building, manor house, parish church, castle, chapel, museum and so on.
  Matching is on the direct `P31` value with no subclass inference, which is why
  the list is explicit rather than a `P279*` walk.
- **Coordinates** use `scope: "value"` on `P625`, which is what makes the
  `{valueLat}` / `{valueLon}` placeholders available to the radius queries.

## Data notes

Worth knowing before adding queries, all measured against the live endpoint:

- The corpus is ~6,500 items: ~2,400 paintings, ~1,990 of them typed as ceiling
  painting, ~1,240 people, and ~540 buildings holding the paintings.
- **Iconclass (`P1257`) is the iconography, not `depicts` (`P180`).** 1,741 of
  1,986 ceiling paintings carry an Iconclass notation; exactly 2 carry `P180`.
  Any query about subject matter has to go through `P1257`.
- Iconclass codes are hierarchical, so the queries truncate to a three-character
  branch (`91E23` → `91E`) to find thematic relatives. Exact-code matching is too
  sharp: `91E23` is unique in the whole of Wikidata, while its branch has 33
  members.
- Paintings almost never have their own coordinates or images — 3 of 1,986 have
  `P18`. Everything geographic has to be routed through `P276` to the building,
  which does have coordinates (531 of 537).
- `commissioned by (P88)` is unusually well populated here (761 paintings), which
  is why patronage gets its own pair of queries.

## A caveat on the example items

`example` on each template is an item where the button appears *and* the query
returns something. Note that **Michael Wiedemann ([Q104759111](https://www.wikidata.org/wiki/Q104759111))
is not usable as an example** even though he is one of the four items P10626 cites
as a property example: nothing on Wikidata links to him except that property
statement, so every creator-based query returns empty. The person-scoped
templates use [Cosmas Damian Asam (Q715693)](https://www.wikidata.org/wiki/Q715693)
instead — 76 corpus works across 6 buildings.
