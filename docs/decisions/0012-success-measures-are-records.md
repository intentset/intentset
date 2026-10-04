# ADR 0012: Success measures are records of their own, and verification is not success

**Status:** accepted, 2026-10-04

## Context

Intentset could say why a product was changing (`intent`), what change was expected (`outcome`), what the product
promised (`behavior`) and whether the promise was built as described (`verification` and run evidence). The one thing
it could not say was whether building it worked. An outcome's Measure section asked for a metric, a baseline, a target
and a method in prose, so an agent starting from "build feature X" had nowhere to put the numbers that would later
tell anyone whether X was worth building, and nothing checked that an approved outcome had any.

The gap mattered for the family's loop: Intentset describes a product, Streamlane plans and tracks the change,
Driftline watches it in production. Driftline can attribute an error to a slice through the ownership report, but
there was no record for it to attribute a reading to. The brief that opened this work (2026-10-04) asked for a
first-class success measure, the relationship intent → outcome → measure, and a clear distinction between
verification (did we build it right) and success measurement (did it produce the outcome), without turning Intentset
into an analytics system.

## Decision

- **`measure` is the thirteenth artifact type.** One file, ID prefix `MEAS`, `parent` naming the outcome it judges,
  the common fields every record has, and a `measure` metadata block: `metric` (an identifier), `baseline` (a value or
  the literal `unknown`), `target`, `window`, `source` and an optional `direction`. Its one required section is
  `Method`. The block on any other type is CORE001, as a `verification` block is. A typed `measures` array on the
  outcome was the alternative; it was rejected because a measure then has no ID of its own, no status, no visibility,
  and nothing a reading could be attributed to later.
- **Baseline, target and window are prose.** `under 2 days` and `90 days after pilot-1` are complete values. Every real
  measure that does not fit a numeric shape would have ended up as a string anyway, and a validator cannot judge a
  target; a reviewer can. Only `metric` has a pattern, because an evidence source will key on it.
- **`source` comes from a registry.** `evidenceSources` joins owners, audiences and the release dimensions in
  `registries.yaml`, so a source a measure names is one the team has agreed to read from, and a typo is CORE005. The key
  is `evidenceSources` rather than `sources` because `sources` already names a conformance case's non-document files
  and the knowledge report's member.
- **An outcome past draft needs a measure.** A draft outcome with none is CORE009, a warning, like a draft rule nothing
  governs; approved or later it is CORE003. The capabilities under an outcome do not count: they say what will be built,
  not how success is read.
- **The outcome's Measure section stays**, as the summary of how the outcome is judged. Presence is all the validator
  checks, so no existing outcome breaks; the field-level requirement moved to the measure records. An intent's
  Rationale now has to name the problem or opportunity, which is where the brief's "problem" lives rather than in a
  fourteenth type above intent.
- **No behavior → outcome edge.** Capability → outcome through `parent` and `supports` already reaches every behavior
  from an outcome, and impact and the Atlas walk that path. A second path to the same fact is a second thing to keep
  consistent.
- **Outcome evidence is named, not built.** Core §8 says what an outcome evidence record will carry (measure ID,
  window, observed value, source, time, URI, target met) and that it is never current the way a run record is: a
  reading is bound to a window, not to a commit. No schema and no reader ship; a schema nothing reads would drift.
  Until it exists, such evidence travels in `extensions`.
- **Export 0.3, Core stays 0.1.** A new type value is one a 0.2 reader's closed schema rejects, which is exactly export
  §7's test for a version change. 0.3 also carries `tips` on artifacts, which ADR 0011 deferred to this bump, and
  `registries.evidenceSources`. Every existing document is still a valid 0.1 document, so the Core version holds.

## Consequences

- Fifteen cases in `tests/core.json` cover the block, its fields, the parent, the registry and the outcome rule, and
  the export cases carry the two Lantern measures under `OUT-PREPARE`. The consumer fixtures gained a rejected 0.2
  envelope; Streamlane's and Driftline's readers move their pin when they next update.
- The Lantern example has fifteen records, and every count that said thirteen moved with it. The baseline's graph hash
  changed, as any baseline byte does.
- An agent writing an outcome now writes its measure in the same change; the guide `init` writes says so, and says that
  a passing check is not the outcome achieved.
- What Intentset still does not do, on purpose: collect telemetry, run a query, compute a metric or draw a dashboard.
  The registry names the systems that do.
