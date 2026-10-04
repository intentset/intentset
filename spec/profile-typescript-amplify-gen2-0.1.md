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
    index.ts                   # cross-slice public contract: the slice's entrypoint in this package
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

This is a reference mapping; directory migrations are not a prerequisite to first adoption. A repository MAY group slices under named domains with one alias per group (for example `@assessment/*`), and folders a slice does not need stay absent rather than empty. A backend too large for one CloudFormation deployment is split into areas, each its own Amplify backend behind one AppSync Merged API; §9 gives that layout and its rules.

## 2. TypeScript boundaries

| Rule | Requirement |
|---|---|
| TS001 | A slice's cross-slice contract MUST be the explicit exports of its entrypoints, one `index.ts` per package it spans |
| TS002 | Cross-slice imports MUST use an exact configured alias and MUST resolve to one of those entrypoints |
| TS003 | Screens MUST NOT be exported from an entrypoint; only the explicitly configured Router may import screen internals directly |
| TS004 | Type-only imports, dynamic imports, re-exports, and path aliases MUST be included in boundary analysis |
| TS005 | Runtime resolver/bundler and type-checker MUST agree on alias resolution |
| TS006 | Wildcard aliases opening another slice's internals MUST NOT be permitted |

Example alias: `@assessment/schedule` → `src/features/assessment/schedule/index.ts`. A slice that spans packages, its logic in a library package and its UI in an app, has an `index.ts` in each, and a consumer normally imports the one in its own package. A repository that lets its router import screens directly MUST name that one file (for example `src/app/routes/Router.tsx`) and MUST NOT widen the exemption to all application files. A separate composition entrypoint is an optional future design requiring an ADR, not the inherited convention. An alias is convenience, not an access-control boundary: the checker must resolve relative and transitive re-export paths too. TypeScript `paths` does not rewrite emitted imports, so bundler/runtime configuration must match it. [TypeScript paths documentation](https://www.typescriptlang.org/tsconfig/paths.html)

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
| `index.ts` (each entrypoint) | explicit contract-safe types, constants, policies, use-cases, client functions, and hooks that do not import other slices |

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

AMP007 to AMP013 apply only to a repository split into areas (§9).

**Inherited exception — response envelope only:** feature `client/` modules MAY import `parseResolverResponse` from `@/amplify/shared/lambda-core/`. A repository adopting this profile names that one module explicitly. Treat it as a narrow named exception, not permission to import handlers or resource definitions. Preserve one authoritative backend contract; do not manually copy transport types.

**Optional proposed extension — schema type bridge:** AWS's exported `Schema` pattern may motivate a type-only bridge, but this profile does not authorize one by default. A repository split into areas declares exactly one bridge, because its one client spans every area's schema (§9, AMP011). The default profile therefore forbids frontend imports of `amplify/data/resource.ts`, including type-only imports. An adopting repository MAY approve a precisely scoped ADR for a type-only bridge, with no value imports and checks proving backend runtime code is absent from the browser bundle. Report this as an explicit exception to the baseline, not inherited conformance. Alternatively evaluate a generated declaration-only contract package; generation must preserve the backend authority and must not be described as already implemented.

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

## 9. Areas: more than one backend

Amplify Gen 2 deploys a backend as one CloudFormation root stack with nested stacks. CloudFormation caps each stack at 500 resources and each deployment at 2,500 resources across the whole nested hierarchy, and neither limit can be raised. Gen 2 generates a pipeline resolver and a function configuration for every model operation, about 16 resources per model with subscriptions, plus one per global secondary index, and each Lambda function costs about 5. Gen 2 offers no supported way to choose the nested stack a model's or function's resources land in. A large product therefore reaches a limit with one backend whatever its slices look like. (Added 2026-10-04 from a production application that split into four areas at about 2,500 resources, and Streamlane, whose single backend reached 510 resources in one nested stack at 85 custom operations.)

A repository MAY split its backend into **areas**. An area is one Amplify backend, with its own `backend.ts`, its own `data/resource.ts` and its own CloudFormation deployment and source AppSync API, together with the frontend slices whose behavior it serves. One AppSync Merged API joins the areas' source APIs (`AUTO_MERGE`, at most 10 per Merged API), and the frontend talks only to it. A repository with one backend is not affected by this section. Once a repository declares areas, every rule below is normative for it.

```text
src/features/<area>/<slice>/      # alias @<area>/*; the area's slices
src/infrastructure/amplify/client.ts   # the schema bridge: the one generateClient
amplify-<area>/amplify/
  backend.ts
  data/resource.ts                # this area's whole schema
  functions/<name>/{resource.ts,handler.ts}
packages/amplify-shared/          # domain-neutral backend code, imported by every area
merged-api/                       # the Merged API (CDK; Gen 2 has no native Merged API)
```

Areas are declared in `.intentset/architecture.yaml`:

```yaml
areas:
  - name: platform
    backend: [amplify-platform/amplify/**]
    schema: amplify-platform/amplify/data/resource.ts
    frontend: [src/features/platform/**]
  - name: assessment
    backend: [amplify-assessment/amplify/**]
    schema: amplify-assessment/amplify/data/resource.ts
    frontend: [src/features/assessment/**]
sharedBackend: [packages/amplify-shared/**]
schemaBridge: src/infrastructure/amplify/client.ts
```

A slice's `domain` names its area. An area's backend counts as backend for AMP001, AMP002 and AMP004, so its functions and resources are claimed by one slice or recorded technical owner as anywhere else.

| Rule | Requirement |
|---|---|
| AMP007 | A slice MUST name a declared area as its `domain`, and its claims MUST NOT reach into another area's frontend or backend |
| AMP008 | An area's backend MUST NOT import another area's backend. Backend code more than one area needs lives in the declared shared backend package, which MUST NOT import any area |
| AMP009 | Each model, enum, query, mutation and subscription MUST be declared in exactly one area's schema, because the Merged API joins every area into one type namespace and refuses a field two sources resolve. A custom type declared in two areas SHOULD be renamed (a warning) |
| AMP010 | Schema relationships (`belongsTo`, `hasMany`, `hasOne`) and references (`ref`) MUST NOT name another area's type. A cross-area link is an ID field, resolved by a function of the area that needs it |
| AMP011 | The frontend MUST reach every area through one client on the Merged API: only the declared schema bridge MAY import an area's schema, type-only, and only it MAY call `generateClient` |
| AMP012 | Backend code MUST reach another area's data through that area's published resource names and the AWS SDK, never through GraphQL or a copy of its schema, and deploy-time dependencies between areas MUST form an acyclic order |
| AMP013 | One authorizer, configured on the Merged API, MUST decide every request to every area, and MUST deny a model or operation it does not list |

AMP007 to AMP011 are checked from source. AMP012 and AMP013 are review assertions: one is a property of deployment wiring and the other of an authorizer's policy, neither of which an import graph shows.

**Budget.** Ownership follows data access, not headroom: a model belongs to the area whose functions read and write it, never to a smaller backend because it has room. An area SHOULD be split, or a new area added, before its deployment passes about 1,500 resources or any nested stack about 300, rather than after a deploy fails. Spreading one area's resources over more nested stacks buys headroom without changing ownership, but it meets other walls (a stack's 200 parameters, a template's 1 MB) and is a stopgap, not a substitute for an area.

**Deployment.** One area, conventionally the one holding identity and tenancy, deploys first and depends on no other area at deploy time. The rest MAY read its published resource names at deploy time; every other cross-area reference is resolved at run time from published names, so that the deploy order stays acyclic (AMP012). The Merged API deploys after every area. Generated client configuration is the union of the areas' outputs with the Merged API's endpoint, and generation MUST fail on a name two areas both declare (AMP009), before the Merged API would.

