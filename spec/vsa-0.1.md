---
title: Intentset Traceable Vertical Slice Architecture Specification v0.1
id: intentset/vsa/0.1
status: draft
revision: 2026-10-05
implementation: 0.6.1
---

# Intentset Traceable Vertical Slice Architecture Specification v0.1

Depends on [Core v0.1](core-0.1.md), whose §1 gives MUST and SHOULD their meaning and the change policy this document follows.

## 1. Architecture model

A product slice owns a cohesive set of observable behaviors end-to-end: presentation, application coordination, domain logic, external access, verification, and explanatory documentation. “End-to-end” means accountable ownership; it does not require every cloud resource to occupy one directory.

Product decomposition and architecture grouping MUST remain distinct. A capability can span slices; a slice may deliver related behaviors from more than one capability when cohesion is explained. A domain is a product-oriented organizational grouping of slices, not a required deployment boundary.

The architecture regions are composition, product slices, shared neutral abstractions, and technical infrastructure. Composition assembles screens, services, routes, and adapters. Shared contains reusable types/utilities with no meaningful product behavior owner. Infrastructure provides technical mechanisms. A reusable business rule stays with its product owner even if many slices use it.

## 2. Normative invariants

| ID | Requirement | Evidence/check |
|---|---|---|
| VSA001 | Every adopted non-draft behavior MUST have exactly one accountable product slice | Unique incoming `implements` |
| VSA002 | Every slice MUST expose one declared public contract surface in each package it spans; a surface MAY be empty for a leaf | Contract record and entrypoints |
| VSA003 | Consumers MUST NOT import another slice's private implementation | Resolved dependency graph |
| VSA004 | All cross-slice dependencies MUST be declared; each consumed contract MUST have one exposing owner | Observed vs declared edges |
| VSA005 | Slice compile-time dependencies MUST be acyclic | Strongly connected components |
| VSA006 | Dependencies inside a slice MUST obey its declared layer policy | Layer import graph |
| VSA007 | Business behavior MUST NOT be owned by shared, infrastructure, or composition | Architecture review + claimed ownership |
| VSA008 | Each implemented behavior MUST identify verification definitions, including negative/authorization cases where applicable | Core verification links + review |
| VSA009 | Source, backend, and contract artifacts MUST have explicit accountable ownership | Path/resource claim resolution |
| VSA010 | Backend access MUST pass through the slice's declared external-access seam | SDK/network access analysis + review |
| VSA011 | Public contract changes MUST include compatibility assessment and consumer verification | Contract diff + review record |
| VSA012 | Deleting or splitting a slice MUST disposition all owned behavior, paths, and contracts | Snapshot graph diff |
| VSA013 | Exception records MUST be complete, unique and current (§9) | Exception record check |

A checker MUST distinguish automatic structural checks from human assertions. It cannot reliably infer “business-neutral” from names or prove absence of dynamic network behavior. Reviews of VSA007 and unresolvable dynamic dependencies are required; unresolved checks cannot be represented as passed.

VSA007, VSA008, VSA010, VSA011 and VSA012 are review assertions in v0.1: no reference check reports them, and the conformance suite has no case for them. A reviewer asserts each, and one not yet reviewed is unresolved, never passed (Core §11).

## 3. Slice metadata

`slice.md` uses the Core carrier and the `intentset/slice/0.1` profile. `slice` is a type-specific object:

```yaml
slice:
  kind: product
  domain: assessment
  entrypoints: [src/features/assessment/schedule/index.ts]
  layers:
    presentation: [src/features/assessment/schedule/ui/**]
    application: [src/features/assessment/schedule/domain/use-cases/**]
    policy: [src/features/assessment/schedule/domain/policies/**]
    model: [src/features/assessment/schedule/domain/models/**]
    external: [src/features/assessment/schedule/client/**]
  claims:
    - kind: source
      path: src/features/assessment/schedule/**
    - kind: backend
      path: amplify/functions/schedule-assessment/**
  usesResources: [RES-ASSESSMENT-DATA]
```

`kind` is `product` or `technical`. Product slices MUST implement at least one behavior. Technical slices MUST give a `rationale`, implement none, and MUST NOT absorb product policy. `domain`, `entrypoints`, `layers`, `claims`, and `usesResources` are required; `layers` and `usesResources` may be empty in a platform-neutral profile if absence is explained in Responsibility.

`entrypoints` is a nonempty list of unique repository-relative file paths, the slice's public contract surfaces. Each MUST lie inside one of the slice's own `source` claims and resolve to a file, and a slice MUST NOT declare two entrypoints in the same package (VSA002). A file's package is the nearest ancestor directory holding a `package.json` in the repository, or the repository root when there is none. Every entrypoint is a public surface: another slice, composition or unowned code MAY import any of them, and any other file of the slice is private (VSA003). A slice whose logic and UI live in different packages has one surface in each, as a monorepo publishes each package through its own entry. (Decided 2026-10-03 after the Streamlane pilot, whose blocked-work slice keeps its rules in a core package and its components in the web app: with one entrypoint, every import of a component read as a private-file import.)

A claim has `kind` (`source`, `backend`, `contract`, `verification`, `documentation`) and `path`. Paths are repository-relative POSIX paths. v0.1 patterns allow literal segments, `*` within one segment, and `**` across zero or more segments. Absolute paths, `..`, traversal through symlinks outside the repository, brace expansion, and negation are forbidden. Include/exclude precedence is therefore unnecessary. Source enumeration MUST use a versioned ignore list to exclude generated/build/vendor output. A nonempty claim matching no file is an error.

While a slice is `draft`, an entrypoint that is not yet a file (VSA002) and a claim that matches no file (VSA009) are warnings: the slice is planned, not yet owned, and the warning names what it still promises. Once the slice leaves draft both are errors. Every other VSA002 and VSA009 condition, such as two entrypoints in one package, an entrypoint outside the slice's claims, two owners for one file, or a registry resource matching nothing, is an error whatever the status, because it is a mistake in what was written rather than code not yet written. (Decided 2026-10-03 for model-first adoption: a product built from its first commit with Intentset writes its slices before their code, and its CI runs at L2 from the start. It mirrors the draft rule for CORE007.)

Two slices MUST NOT own the same resolved file. When ownership differs inside a file, extract a contract/module or assign the file to a technical resource owner; v0.1 does not infer symbol ownership from line ranges. A backend registry MAY declare one technical owner for a shared resource and list consuming slices. `usesResources` references those resource IDs and does not transfer ownership. This registry is a deployment inventory, not a second product graph.

## 4. Contracts and collaboration

A contract node MUST specify an interface, producer ownership, compatibility policy, and consumer impact. Slice `exposes` is the authoritative producer edge. A consumer lists both `consumes` and `dependsOn` the producer. Public contract surfaces MAY include operations, events, DTOs, business-neutral read views, and explicit component APIs permitted by a profile. Database tables and another slice's private models are not implicit public contracts.

Contract entrypoints MUST export only reviewed APIs. Re-exporting private modules through a broad wildcard can expose unintended commitments; explicit named exports are recommended. Contract version changes MUST distinguish compatible additions from breaking removals, renamed fields, tightened preconditions, and changed event meaning. Runtime/event consumers require contract tests even without a source import.

Events MAY decouple compile-time dependencies through a neutral event contract registry. Event producer/consumer ownership MUST still be declared. A runtime workflow cycle is not automatically a compile-time import cycle, but MUST document delivery, idempotency, retry, timeout, and failure ownership. An event bus is not permission to hide dependencies.

## 5. Internal dependency policy

The portable invariant is that presentation/composition MUST NOT become a dependency of lower-level product logic. Profiles MUST provide a concrete allowed matrix. The reference profile retains use-cases → client as an external-access seam while keeping policies/models independent of backend technology.

| Region | May depend on | Must not depend on |
|---|---|---|
| Composition | Declared slice composition surfaces, neutral shared, infrastructure setup | Private business logic through ad hoc imports |
| Slice | Own permitted layers; declared foreign contracts; shared; infrastructure through seam | Foreign internals |
| Shared | Shared neutral abstractions | Infrastructure, slices, composition, owned business policy |
| Infrastructure | Infrastructure, shared neutral abstractions, external libraries | Slices or composition |

The dependency direction is infrastructure → shared, never shared → infrastructure. Product-specific behavior remains slice-owned. An import that crosses a region the wrong way, shared importing infrastructure, composition or a slice, infrastructure importing composition or a slice, or a slice importing composition, is REG001, an error. It is checked from the import graph; VSA007 asks the different question of who owns business behavior, which no import shows.

## 6. Composition and screens

Composition MUST wire rather than implement business behavior. A profile MAY define narrowly scoped direct screen imports by a named router or a composition-only entrypoint, distinct from a cross-slice public contract. This is explicit access granted only to composition, not a loophole allowing slices to deep-import UI. Ownership remains with the slice. Route guards MAY coordinate access, but authoritative authorization belongs at the backend boundary and product rules remain slice-owned.

## 7. Backend resources and data

A unified deployment root is compatible with VSA. A slice MAY claim a handler outside its frontend directory. Shared schema/resource definitions MUST have one recorded owner; slice claims MUST NOT overlap merely because multiple slices use a model. Resource access is distinct from behavior ownership.

Client seams adapt transport types to domain types and normalize errors. Frontend checks improve experience; backend enforcement MUST protect authorization, tenant isolation, and business invariants against bypass. A slice owning a rule also owns verification of its backend enforcement, regardless of deployment location.

## 8. Verification and change workflow

Verification artifacts MAY be outside the slice (for example journey tests), but MUST link explicit behaviors/rules/scenarios. A journey spanning slices has one test owner and multiple `verifies` targets. Fixtures that mention an ID without asserting it MUST NOT count as coverage.

A behavior change review SHOULD include: observable change; rules/scenarios affected; owner and contracts; implementation paths; evidence; audience knowledge impact; release availability. A refactor with no behavior change still updates moved claims and contract dependencies. IDs survive file moves.

## 9. Exceptions and adoption

An exception record MUST include ID, rule, exact paths/edges, rationale, accountable owner, approver, creation date, expiration date, and remediation issue. A record that is incomplete or malformed, or repeats another record's ID, is a VSA013 error and covers nothing. An expired exception is a VSA013 error, and what it covered is an error again. A current exception that covers no diagnostic is a VSA013 warning, so a retired violation retires its exception too. A diagnostic a current exception covers is kept as a warning naming the exception, never hidden. Exceptions MUST be visible in reports. A cycle exception means VSA005 failed with a documented exception, not that the dependency graph is acyclic.

Adopt by declared scope. Baseline existing violations, block new violations, and progressively retire the baseline. A baseline is not a blanket waiver for new files or enlarged violations. Migration mode and strict conformance mode MUST be distinguishable. Consumers outside the scope that import a file inside it past a slice's public surfaces are reported as warnings (VSA003, and a profile's screen rule), so a narrow scope cannot hide them and they do not fail the scope's conformance. An entrypoint imported from outside the scope is not reported. (Decided 2026-10-03 after the Streamlane pilot, whose scope of one slice's files hid every consumer that reached past it.)

## 10. Conformance fixtures

A VSA implementation MUST be testable independently from the reference CLI. Required cases include: valid public import; a slice with an entrypoint in each of two packages; two entrypoints in one package; deep import through relative path; a deep import from outside the declared scope; alias and re-export bypass; missing dependency; compile-time cycle; overlap/empty path claim; resource consumer with no ownership conflict; backend call outside seam; composition-only screen import by another slice; expired exception; orphaned behavior after slice deletion. Diagnostic IDs MUST remain stable within v0.1.
