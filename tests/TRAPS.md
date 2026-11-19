# ADVERSARIAL — entities fixture (18 traps)

Fixture pairs for the **entities-uniqueness** engine. All entities under
`tests/duplicates/e01…e18` are compared against all others in the consolidated
fixture trees (`tests/duplicates`, `tests/NOT_duplicates`). Files are organized
by trap id (`tests/duplicates/e01/…`). Expectations live in `manifest.json`;
the detector agent runs the engine, this fixture only plants the traps.

Framework imports (`mobx`, `zod`, `@reduxjs/toolkit`, `zustand`,
`mobx-state-tree`, `@keystone-6/core`, `class-validator`) are intentionally
unresolved — no `node_modules` is needed; the TS parser reads syntax only.

## Trap table

| id | mechanism | pair (a ↔ b) | expect |
|----|-----------|--------------|--------|
| e01 | GraphQL interface vs Apollo type literal, reordered fields | `GqlOrder` ↔ `OrderFragment` | duplicate |
| e02 | MobX observable class vs plain interface, same props | `SessionStore` ↔ `SessionRecord` | duplicate |
| e03 | Redux slice state type vs Zustand store type, same fields | `CartState` ↔ `CartStore` | duplicate |
| e04 | zod schema vs plain interface, same fields | `PaymentSchema` ↔ `Payment` | duplicate |
| e05 | bare alias `type Account = AccountBase` (+ extends-chain bonus) | `AccountBase` ↔ `Account` | alias |
| e06 | unannotated const object duplicating an interface shape | `NotificationEndpoint` ↔ `defaultDeliveryTarget` | duplicate |
| e07 | all keys renamed, deep value tree identical (renamed copy) | `releaseGate` ↔ `rolloutPolicy` | duplicate |
| e08 | all keys renamed, exactly half the leaf values differ (veto) | `digestSettings` ↔ `alertPreferences` | similar |
| e09 | every method name one letter apart; prop values differ | `TicketService` ↔ `TicketFacade` | similar |
| e10 | identical method set modulo long `internalRepository` prefix | `InternalCustomerRepository` ↔ `CustomerRepository` | similar |
| e11 | enum vs string-literal union, same closed set, reordered | `ShipmentStatus` ↔ `ShipmentState` | duplicate |
| e12 | enum vs union with ONE extra member | `InvoiceStatus` ↔ `BillingState` | similar |
| e13 | interface vs implementing class + extra private machinery | `EventChannel` ↔ `KafkaEventChannel` | similar |
| e14 | same property names, every property type different | `SensorSample` ↔ `SensorCalibration` | none |
| e15 | MST model vs MobX class, same domain shape | `WarehouseModel` ↔ `WarehouseStore` | duplicate |
| e16 | Keystone list config vs class-validator DTO, same fields | `ProductListing` ↔ `ProductDto` | duplicate |
| e17 | intersection extension `Base & {extra}` = reuse | `WebhookEvent` ↔ `AuditedWebhookEvent` | none |
| e18 | getters over private snapshot vs readonly properties | `FeatureFlagView` ↔ `FeatureFlagState` | similar |

Negative / non-duplicate traps: **e05 (alias), e08, e09, e10, e12, e13, e14
(none), e17 (none), e18** — 9 of 18, above the required 5.

## Intent per trap

**e01 — GraphQL vs Apollo.** No GraphQL/Apollo normalizer exists, so both
sides are plain TS: an `interface` and an object-literal `type` with the same
8 fields (including nested `lines[]` and `shippingAddress{}`), different
order and names. Tests that interface↔type-literal comparison is
order-insensitive and framework-agnostic.

**e02 — MobX vs plain interface.** `SessionStore` wraps 8 properties in
`makeObservable`/`observable`; `SessionRecord` is a bare interface with the
same 8 properties. The framework normalizer must strip the MobX ceremony so
the property sets meet. The constructor is the only method; slight dilution
is acceptable.

**e03 — Redux vs Zustand.** `CartState` and `CartStore` declare the same 6
fields in different order. The `createSlice`/`create` call results are not
object-literal entities, so the named types are the only compared entities —
tests cross-framework type comparison without runtime noise.

**e04 — zod vs interface.** `PaymentSchema` (`z.object` with `.int()`,
`.length(3)`, `.nullable()`, `.optional()`, `z.enum`) vs `Payment` interface
with the equivalent TS types (`number`, union literal, `| null`, `?`). The
zod normalizer must reduce validators to plain property types.

**e05 — alias + extends chain.** `type Account = AccountBase` must yield the
**alias** verdict, not duplicate. Bonus (documented, not scored):
`PremiumAccount extends AccountBase` in `derived.ts` is legitimate reuse and
must be none/alias, never duplicate.

**e06 — object duplicates a type without implements.** `defaultDeliveryTarget`
is deliberately **unannotated** (annotated consts and `satisfies` are skipped
as entities). Its 8 keys mirror `NotificationEndpoint` exactly, with concrete
values. Tests the "entity duplicates a type" path where only one side carries
values.

**e07 — renamed copy, deep values.** Every key at every level is renamed
(`rollout→traffic`, `percentage→share`, …) but the value tree is identical:
4 nesting levels, arrays of objects, mixed strings/numbers/booleans. With
zero name overlap, only the values signal can carry this — the canonical
"renamed copy" case (~0.93).

**e08 — partial values veto.** Same structure as e07, all keys renamed, but
exactly 6 of 12 leaves differ (`weekly→daily`, `9→18`, `mon/thu→tue/fri`,
`push:false→mobile:true`, `25→40`). Half-identical values must veto the
duplicate verdict; expect similar (extract acceptable in spirit, marked
similar).

**e09 — one-letter method names.** 8 methods per class, each name a single
mid-name substitution (`fetchTicket→fetchTirket`, `updateTicket→updoteTicket`,
…). Property names match but their **values differ**, so the values signal
cannot push this to duplicate — the pair isolates fuzzy method-name
matching. The % question: how much credit do near-miss names earn?

**e10 — long shared prefix.** Identical 6-method sets, one class prefixes
every method with `internalRepository`. No properties at all. Judgment:
marked **similar** — duplicate if the engine strips common prefixes, none if
method matching is exact-name. Either extreme is informative; see risks.

**e11 — enum ↔ union, same set.** `ShipmentStatus` (8-member string enum) vs
`ShipmentState` (same 8 literals, shuffled). Closed-set equality must ignore
order and declaration form.

**e12 — enum ↔ union, one extra.** `BillingState` adds `"disputed"` to
`InvoiceStatus`'s 6 members. Near-miss closed sets must not collapse into a
duplicate; expect similar/extract.

**e13 — implements + private superset.** `KafkaEventChannel implements
EventChannel` (4 props + 4 methods shared) but adds 3 private properties and
4 private methods. If private members count, the superset dilutes the match
to similar; if they are stripped, this becomes a near-perfect duplicate —
the trap probes exactly that boundary.

**e14 — same names, different types (negative).** All 8 property names
identical, every type genuinely swapped (`string↔number`, `boolean↔number`,
`string[]↔Record`, `{lat,lng}↔string`). Name overlap alone must not produce
a duplicate. Marked **none**; similar is a defensible landing (see risks).

**e15 — MST vs MobX.** `types.model("Warehouse", {...})` (7 fields, one
`types.maybe`) vs a MobX observable class with the same 7 fields
(`managerId: string | undefined` mirrors `maybe`). Two recognized frameworks,
one shape.

**e16 — Keystone vs class-validator.** `list({fields:{…}})` (text / integer /
checkbox / timestamp) vs a decorated DTO class with the same 6 product
fields. Both normalizers must reduce to the same property set; `timestamp`
vs `string` for `createdAt` is the one soft type edge.

**e17 — intersection extension (negative).** `type AuditedWebhookEvent =
WebhookEvent & {…3 extra}` is reuse built on top of the base, not a copy and
not a bare alias. Expect **none**.

**e18 — getters vs properties (invention).** `FeatureFlagState` exposes the
same 8 flags as `FeatureFlagView` through getters over a private
`Record<string, unknown>` snapshot; the interface uses `readonly` stored
properties. Probes whether accessors normalize to properties. High variance
by design: duplicate if getters→properties, similar if partially credited,
none if getters count as methods. Marked **similar** as the middle landing.

## Honest risk assessment (where the engine may miss or misjudge)

- **e10 (highest risk).** With zero properties and zero exact method-name
  matches, an exact-name matcher scores this near **none**, missing the
  marked `similar`. A prefix-stripping or fuzzy matcher may instead call it
  **duplicate**. Both outcomes are plausible; this trap is a probe, not a
  confident prediction.
- **e13.** If the engine ignores `private` members (common), the implements
  link + full public overlap yields **duplicate**, contradicting the marked
  `similar`. The trap is only "similar" when private machinery is counted.
- **e14.** Property-name overlap is 8/8; if the properties signal compares
  names without types, this can land at **similar** (~0.35–0.45) instead of
  the marked `none`. Types are genuinely different, so `duplicate` would be
  a true engine error.
- **e18.** Three-way variance (none/similar/duplicate) depending on getter
  handling; `similar` is a guess at the middle, not a strong prediction.
- **e08.** With all keys renamed AND half the values different, a strict
  positional value-tree comparison may find too little evidence and return
  **none** rather than `similar`.
- **e06.** Only the object side carries values; if the engine requires
  two-sided value evidence and weighs properties alone (~0.45), this could
  land at **similar** instead of `duplicate`.
- **e16.** `timestamp` (Keystone) vs `string` (DTO) may count as a type
  mismatch on 1 of 6 fields; should still clear the duplicate threshold, but
  it is the weakest positive.
- **e02/e15.** Constructor / `makeObservable` ceremony may add unmatched
  method markers; expected to stay above 0.85 but worth watching.

Most confident positives: **e01, e03, e04, e07, e11**. Most confident
negatives: **e05 (alias), e17 (none)**.
