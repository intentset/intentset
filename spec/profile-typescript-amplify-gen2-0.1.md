# TypeScript + AWS Amplify Gen 2 Reference Profile v0.1

**Status:** proposed normative reference profile, not an executable Amplify starter.  
**Profile ID:** `intentset/typescript-amplify-gen2/0.1`

Implements [Core](core-0.1.md) and [Traceable VSA](vsa-0.1.md). Rules below are Intentset decisions, not requirements imposed by AWS. Package versions and compatibility must be pinned and exercised in the first implementation milestone.

## 1. Reference layout

```text
product/                       # Intentset product/knowledge documents
src/
  app/                         # application and route composition
  features/<domain>/<slice>/
    slice.md                   # sole slice metadata record
    index.ts                   # cross-slice public contract
    ui/
    client/
    domain/{models,policies,use-cases}/
    tests/
    docs/
  shared/                      # neutral types, utilities, primitives
  infrastructure/
    amplify/                   # technical client setup; no resource imports by default
amplify/
  backend.ts                   # unified backend composition
  data/resource.ts             # single authoritative data schema
  auth/resource.ts
  functions/<function>/{resource.ts,handler.ts}
architecture/{decisions,resources,exceptions}/
.intentset/                    # registry/config, not secrets or generated truth
```

This is a reference mapping; directory migrations are not a prerequisite to first adoption. A repository MAY group slices under named domains with one alias per group (for example `@assessment/*`), and folders a slice does not need stay absent rather than empty.

## 2. TypeScript boundaries

| Rule | Requirement |
|---|---|
| TS001 | A slice's cross-slice contract MUST be its explicit `index.ts` exports |
| TS002 | Cross-slice imports MUST use an exact configured alias and MUST resolve to that contract |
| TS003 | Screens MUST NOT be exported from `index.ts`; only the explicitly configured Router may import screen internals directly |
| TS004 | Type-only imports, dynamic imports, re-exports, and path aliases MUST be included in boundary analysis |
| TS005 | Runtime resolver/bundler and type-checker MUST agree on alias resolution |
| TS006 | Wildcard aliases opening another slice's internals MUST NOT be permitted |

Example alias: `@assessment/schedule` → `src/features/assessment/schedule/index.ts`. A repository that lets its router import screens directly MUST name that one file (for example `src/app/routes/Router.tsx`) and MUST NOT widen the exemption to all application files. A separate composition entrypoint is an optional future design requiring an ADR, not the inherited convention. An alias is convenience, not an access-control boundary: the checker must resolve relative and transitive re-export paths too. TypeScript `paths` does not rewrite emitted imports, so bundler/runtime configuration must match it. [TypeScript paths documentation](https://www.typescriptlang.org/tsconfig/paths.html)

## 3. Internal layer matrix

Each row may import itself plus listed targets. Test files MAY import their own slice internals; tests MUST NOT bypass foreign slice contracts. Entry files are reviewed façades, not general-purpose logic modules.

| Source | Allowed targets inside its slice |
|---|---|
| `ui/screens` | components, hooks, display view-models; thin assembly only |
| `ui/components` | hooks, view-models, model types; rendering and interaction wiring |
| `ui/hooks` | view-models, use-cases, model types; state coordination |
| `ui/view-models` | model types and pure display transformations |
| `domain/use-cases` | policies, models, client |
| `domain/policies` | models |
| `domain/models` | models |
| `client` | models |
| `index.ts` | explicit contract-safe types, constants, policies, use-cases, client functions, and hooks that do not import other slices |

UI MUST NOT call the backend directly. Policies/models MUST NOT import UI, clients, or cloud SDKs. Client code MAY use technical infrastructure. Use-cases MAY orchestrate declared foreign slice contracts. Shared neutral types/utilities are available to each layer. Features may import neutral infrastructure; backend operations remain restricted to client seams. Shared MUST NOT import infrastructure; infrastructure MAY import shared. Application initialization may configure technical clients but MUST NOT perform product service calls or own stores. The UI matrix encodes a downward flow and one responsibility per folder; type-only dependencies still count for cycle analysis. Pure exported policies MAY be called through another slice's public contract when dependency direction remains valid. Avoid a use-case importing a client that imports the use-case back.

## 4. Amplify boundary and schema bridge

Amplify Gen 2 describes backend resources in TypeScript, with `amplify/data/resource.ts` defining the data schema and exporting a `Schema` type. The client can be configured from `amplify_outputs.json` and created with `generateClient<Schema>()`. [AWS data setup](https://docs.amplify.aws/react/build-a-backend/data/set-up-data/)

Intentset imposes the following additional constraints:

| Rule | Requirement |
|---|---|
| AMP001 | Frontend MUST NOT import executable backend resource definitions |
| AMP002 | Slice backend operations MUST occur through `client/`; SDK initialization MAY reside in infrastructure |
| AMP003 | Backend transport/schema contracts MUST have one authoritative definition; domain models MAY differ through explicit adapters |
| AMP004 | Backend handlers/resources MUST be claimed by one slice or recorded technical owner |
| AMP005 | Backend authorization and product invariants MUST be verified independently of frontend validation |
| AMP006 | Generated client/configuration and runtime SDK types MUST NOT leak into domain policy/model layers |

**Inherited exception — response envelope only:** feature `client/` modules MAY import `parseResolverResponse` from `@/amplify/shared/lambda-core/`. A repository adopting this profile names that one module explicitly. Treat it as a narrow named exception, not permission to import handlers or resource definitions. Preserve one authoritative backend contract; do not manually copy transport types.

**Optional proposed extension — schema type bridge:** AWS's exported `Schema` pattern may motivate a type-only bridge, but this profile does not authorize one by default. The default profile therefore forbids frontend imports of `amplify/data/resource.ts`, including type-only imports. An adopting repository MAY approve a precisely scoped ADR for a type-only bridge, with no value imports and checks proving backend runtime code is absent from the browser bundle. Report this as an explicit exception to the baseline, not inherited conformance. Alternatively evaluate a generated declaration-only contract package; generation must preserve the backend authority and must not be described as already implemented.

The initial draft incorrectly treated the type bridge as an existing permitted seam. This revision removes that assumption. Actual client initialization and contract generation must be inspected during implementation before choosing an adapter; no source-project SDK code was audited here.

## 5. Scheduling example: responsibilities, not a cloud implementation

The sample behavior is illustrative and is not claimed to exist in any product. A teacher schedules a published assessment for a class they can manage. The authoritative server checks permissions, published state, and future time; it records the schedule and ensures students cannot access it before release. Product review must define time zone presentation, retries, cancellation, precision, and delivery tolerance before marking this behavior released.

| Responsibility | Owner / location |
|---|---|
| Form and visible error state | Schedule slice `ui/` |
| Coordinate request, handle result | `domain/use-cases/` |
| Pure date/input policies | `domain/policies/` |
| Transport call and error translation | `client/` |
| Authoritative permissions/state checks | Slice-owned backend handler |
| Shared data resource configuration | Technical owner in resource registry |
| Timed execution and retry mechanism | Declared backend implementation, verified in sandbox |
| Observable student availability | Behavior-linked integration/journey tests |

A Lambda declaration alone does not implement future delivery. Choosing a durable scheduler/queue and idempotency strategy is an implementation decision requiring an ADR. This package makes no latency or exactly-once guarantee.

Amplify functions use `defineFunction` with a handler and are composed into the backend. Resource layout and business ownership are separate concerns. [AWS function setup](https://docs.amplify.aws/react/build-a-backend/functions/set-up-function/)

## 6. Contract and resource ownership

Maintain `architecture/resources/registry.yaml` with resource ID, path, technical owner, and consuming slice IDs. Example: `RES-ASSESSMENT-DATA` refers to the shared data definition and is owned by `team-platform`; the schedule slice lists it in `usesResources`. The slice claims only its dedicated handler path. Do not let every feature claim all of `amplify/data/resource.ts`.

Transport types derive from the backend source; domain models represent product meaning. An adapter between them is not a forbidden duplicate contract. Manually copying a GraphQL transport schema into several slices is. Generated files are excluded from hand-maintained ownership claims and checked through their generator source/provenance.

## 7. Verification and enforcement

Implement resolved import rules through dependency-cruiser or equivalent; use TypeScript checking for actual resolution and a linter for local coding rules. Tool names do not themselves prove enforcement. The implementation must include negative fixtures that exercise aliases, type imports, dynamic imports, re-exports, app-only screens, and backend SDK calls outside seams.

A verifier adapter SHOULD map stable test IDs to test-run results without modifying test framework semantics. The package's `TEST-ASMT-SCHEDULE` record is a definition, not a passing run. Use a stable test title/selector or supported framework annotations; do not invent `describe.behavior` APIs.

CI sequence:

1. Parse documents, validate schema/relationships and type-specific sections.
2. Resolve implementation claims, registries, dependencies, and exceptions.
3. Type-check and enforce architecture boundaries, including backend bundle exclusion.
4. Run unit, contract, integration, and selected end-to-end checks; collect snapshot-bound evidence.
5. Generate an impact/review report, showing stale knowledge and uncovered rules.
6. On reviewed release, create an immutable snapshot and audience-specific publication preview.
7. Publish only the approved projection after release availability and access checks pass.

The first repository adoption MUST test against locked TypeScript, Amplify, test-runner, and import-checker versions. Record Node/runtime compatibility from the adopted dependency set rather than treating this document as an evergreen installation guide.

## 8. Reference implementation acceptance

Acceptance requires a clean sample repository, deliberate failing fixtures, one deployed sandbox journey, tenant/role denial tests, current evidence export, absence of backend resources from the browser bundle, deterministic graph output, and a reviewed Markset publication. These checks are roadmap work; no AWS deployment or TypeScript package compilation was performed for this document package.
