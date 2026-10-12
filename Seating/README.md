# Seating — a usefulQueries profile for ceremonial seating arrangements

A profile of [usefulQueries](../README.md) for events whose participants are
recorded *in order*: court ceremonial, where a wedding, a coronation or a
banquet is documented seat by seat, with each guest's role and rank of
precedence. The worked example is the
[wedding of Maximilian II Emanuel and Maria Antonia (Q140068424)](https://www.wikidata.org/wiki/Q140068424),
taken from the Vienna *Zeremonialprotokolle*.

It targets Wikidata itself, not a separate Wikibase — the settings are the stock
Wikidata ones. The profile exists to ship a different set of buttons.

## Build

```bash
node scripts/assemble.mjs --profile Seating
```

Writes `Seating_usefulQueries.js` and `minified_Seating_usefulQueries.js` into
this folder. Upload the minified file to your Wikidata user JS page.

## The buttons

| File | Shown on | Answers |
| ---- | -------- | ------- |
| `seatingOrder` | a ceremony's `instance of` | who sat where: seat, rank, role, and the neighbours — the whole protocol as one table |
| `seatingChain` | a ceremony's `instance of` | the same seating as a graph, read along the table, with portraits |
| `coParticipantGraph` | each `participant` statement | where else this guest met people, and whom |
| `participantEvents` | each `participant` statement | the events this guest is recorded at, over time, grouped by the role they appeared in |

## How the seating is modelled

All of it hangs off qualifiers on `participant (P710)`:

| Qualifier | Role in the model |
| --------- | ----------------- |
| `series ordinal (P1545)` | the seat — position in the recorded order |
| `ranking (P1352)` | rank of precedence, which is *not* the seating order (at Q140068424 the emperor ranks 1st and sits 6th) |
| `object of statement has role (P3831)` | the role in this event: bride, bridegroom |
| `position held (P39)` | the office of an attendant who is not named: chamberlain, seneschal, envoy |
| `follows (P155)` / `followed by (P156)` | the neighbour to either side |
| `opposite of (P461)` | the guest seated across the table |

Three things about this data shape every query here:

- **Unnamed attendants are "unknown value" snaks**, not items — five of the
  eleven guests at Q140068424. In RDF they are blank nodes skolemised into
  `genid` URIs, so they have no label and print as a URI unless suppressed;
  `P39` is what identifies them. Both event queries blank those cells with
  `IF()` over an unbound variable and fall back to the office.
  Watch out for the other half of that trick: an `OPTIONAL` whose subject is one
  of those deliberately unbound variables is not a no-op, it scans the whole
  relation (`?person wdt:P18 ?image` over every image in Wikidata). Look the
  images up from the always-bound statement value instead.
- **The chain cannot be walked through P155/P156.** Where the neighbour is an
  unknown value, those qualifiers are anonymous blank nodes that link to
  nothing — each one is a separate node, not a reference to the guest's own
  statement. `seatingChain` therefore joins seat *n* to seat *n+1* by ordinal,
  which covers every guest; `seatingOrder` still shows P155/P156/P461 because
  there they are read as plain neighbour columns.
- **`seatingChain` labels its nodes by hand** (`rdfs:label` in the user's
  language, then `mul`, then `en`) rather than with the label service, because
  the node label has to carry the seat number — and a `BIND` may not follow the
  label service, which must stay the last pattern in the `WHERE` clause.

## How the buttons are triggered

Template matching sees only properties and values, never qualifiers, so there is
no way to say "show this on events that record a seating order". The two
event-level buttons use the gate pattern instead — `scope: "value"` on `P31`
with an explicit list of ceremony classes: royal wedding, wedding, coronation,
coronation of the British monarch, banquet, state banquet, funeral, ceremony,
state visit, audience. About 380 items on Wikidata today, of which exactly one
carries a full seating order; on the rest the table degrades to the participant
list with whatever roles are recorded. Matching is on the direct `P31` value with
no subclass inference, so a newly used ceremony class has to be added to the
list.

`coParticipantGraph` and `participantEvents` hang on `P710` itself and are not
restricted — they work on any event with participants, sports results included,
and are capped at 300 rows in a subselect for that reason (measured on the
heaviest participant in the data, 2,397 statements: 1.1 s and 2.8 s).

## Data notes

Measured against the live endpoint, which is the reason the gate looks the way
it does:

- `P1545` on a participant statement: ~2,560 events, and almost all of them are
  figure-skating segments and cycling stages, not seating.
- `P1352`: ~65,800 events, overwhelmingly sports rankings.
- `P3831`: ~12,700 events — the one qualifier here that is broadly used.
- `P155`, `P156` and `P461` on a participant statement: **one event in all of
  Wikidata**, Q140068424. Any query built on them is, for now, a query about
  this one item and whatever is modelled after it.
