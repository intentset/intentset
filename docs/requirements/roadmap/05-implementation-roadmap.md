# Intentset implementation roadmap v0.1

**Planning status:** proposed sequence, not a committed release schedule. Indicative effort assumes one dedicated TypeScript engineer with regular product, architecture, and QA review. Parallel staffing may change duration; acceptance gates matter more than calendar estimates.

## Product strategy

Prove that one real behavior can be found, implemented, verified, reviewed, and explained through one connected model. Build trustworthy validation before a large editor or hosted graph. Git remains the system of record. Markset publication and agent context are first-class outputs; neither replaces semantic validation.

## Milestones

| Milestone | Indicative effort | Deliverables | Exit criteria / dependency |
|---|---|---|---|
| M0 Resolve foundations | 1 week | Model decisions; pinned Markset contract; chosen license/governance | Ownership and publication rules accepted; no unresolved carrier ambiguity |
| M1 Core model and parser | 2–3 weeks | TypeScript parser, schemas, typed graph, diagnostics; `init`, `validate`, JSON export | Valid/invalid fixtures pass; safe YAML handling; deterministic output; ID/link/cycle checks; requires M0 |
| M2 Traceable architecture pilot | 2–3 weeks | Slice/path/resource registry resolver, import checks, `architecture check`, CI baseline | Real pilot owner/path coverage; alias bypass/cycle/overlap fixtures fail correctly; requires M1 |
| M3 Verification and impact | 2 weeks | Test adapters, evidence records, `impact`, review diff | Current/stale/fail/skip distinction; changed rules flag dependent knowledge; real pilot tests bound to snapshot; requires M2 |
| M4 Markset knowledge and Atlas | 2–3 weeks | Version-pinned renderer adapter, capability/behavior views, audience projection, `review`, `serve` | Public/customer/internal fixtures demonstrate isolation; source provenance; manual knowledge review; requires M3 |
| M5 Agent context and alpha | 1–2 weeks | Read-only MCP/context tools, packaged CLI, adoption guide, public alpha docs | External adopter completes pilot; customer context cannot access raw engineering graph; reproducible tagged build; requires M4 |

Indicative total: 10–14 engineering weeks plus reviews. M0 must revise estimates after source inspection. Launch specifications for feedback earlier, clearly labeled drafts; defer installation claims until packages exist.

## M0 decisions to close

- Use the reconciled VSA ledger; audit actual rules and ADRs. Preserve the Router exemption and response-parser seam. Treat a schema type bridge as an optional ADR proposal.
- Confirm the Markset specification, upstream version, rendering API, and profile ownership. Keep closed syntax and inert documents.
- Adopt exactly one accountable behavior owner and one authoring carrier; this draft proposes Markdown frontmatter and `slice.md`.
- Choose repository/package/domain locations. `Intentset` is the working name; `.org` ownership and registry availability are not established by this package.
- Select an open-source license and specification contribution process. Suggested discussion starting point: Apache-2.0 for code, with an explicit decision for prose/schema licensing. This package does not make that decision for the copyright holder.

## Reference toolchain boundaries

| Component | Responsibility | First milestone |
|---|---|---|
| parser | Safe frontmatter + Markdown source/provenance | M1 |
| core/schema | Types and semantic constraints | M1 |
| graph | ID resolution, inverse edges, snapshot serialization | M1 |
| validator | Deterministic diagnostics and conformance scope | M1 |
| architecture | File claims, import graph, resources, exceptions | M2 |
| verification | Definition/run adapters, coverage classification | M3 |
| impact | Explainable dependency traversal and snapshot diff | M3 |
| publisher | Audience/version projection + reviewed Markset | M4 |
| atlas | Progressive human review views | M4 |
| cli | Cohesive local commands and JSON reports | M1 onward |
| mcp | Authorized read/context API over existing services | M5 |

Packages can start as modules in a small workspace. Do not create separate publishable packages until their API boundaries stabilize. The specification and conformance fixtures must remain usable by implementations in other languages.

## Proposed command contract

Commands below are design targets, not currently installable commands.

```text
intentset init                         # create local config and small sample
intentset validate                    # schema and graph checks
intentset graph --format json          # deterministic export
intentset architecture check           # ownership and import boundaries
intentset impact BEH-ASMT-SCHEDULE      # explained affected set
intentset review                       # local review report
intentset context BEH-ASMT-SCHEDULE     # bounded engineer context
intentset serve                        # local Atlas
intentset mcp                          # read-only agent interface
```

Use common config discovery, exact versioned output schemas, 0/1/2 exit codes, and machine-readable diagnostics. Network writes, cloud deployment, and publication must be separate explicit operations. A validation command must not mutate source files.

## Definition of alpha done

An adopter can clone a tagged release, define a capability with multiple behaviors, connect owners and real tests, obtain understandable failure diagnostics, review changes in an Atlas, and generate safe Markset knowledge for an exact release. CI rejects a deliberate missing owner, illegal import, stale evidence claim, and internal-text publication attempt. A second implementation can consume exported graph/schema fixtures without importing the TypeScript parser.

The demo should show a change to a scheduling rule propagating to implementation review, verification, and knowledge review. It must visibly distinguish implemented tooling from mock UI and recorded evidence from fabricated coverage percentages.

## Pilot backlog

1. Inventory known architecture and release dimensions; record repository-policy discrepancies.
2. Model one bounded capability with 3–5 behaviors only if the real pilot supports that scope.
3. Add one success, rejection, and authorization scenario per relevant behavior.
4. Bind existing tests; add checks only where a meaningful behavior gap exists.
5. Resolve source/backend/resource ownership and prove an illegal dependency is caught.
6. Produce a capability review showing unresolved gaps honestly.
7. Publish one customer guide with safe citations and release filtering.
8. Have a second engineer locate and change a behavior using only the model/context output.

## Later, after alpha evidence

Consider editor assistance, richer graph navigation, release comparison, additional language/cloud profiles, Jira/Streamlane adapters, ReqIF/OSLC interoperability, and a Markset symbolic-reference proposal. Defer a hosted collaboration platform, automatic “truth” inference, repository-wide mass migration, and mandatory adoption of all portfolio products.

## Open-source operations

Before public release, add the approved LICENSE, contribution guide, code of conduct, security reporting channel, maintainer decision process, release checklist, and compatibility policy. Public specification changes should include motivation, migration impact, and conformance fixtures. Breaking semantic changes require a specification version change; patch corrections must not silently change valid graph meaning.

Measure time to answer “what implements this behavior?”, false-positive rate of checks, percentage of reviewed behavior changes with current evidence, publication rejection correctness, and independent adoption success. Popularity metrics alone do not validate the framework.
