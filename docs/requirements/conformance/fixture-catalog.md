# Independent conformance fixture catalog v0.1

These are implementer acceptance vectors, not a completed reference conformance runner. Apply each mutation independently to an otherwise valid baseline. The bundled draft example is suitable for structural/L1 checks only; L2+ baselines require real source paths and trusted evidence.

| Case | Input / mutation | Expected |
|---|---|---|
| C01 | Unique valid IDs and typed references | Core structural pass |
| C02 | Copy BEH file retaining same ID | CORE002 error |
| C03 | `governedBy: [CAP-ASMT-ASSIGN]` | CORE003 wrong target type |
| C04 | Change parent to nonexistent CAP-MISSING | CORE003 unresolved ID |
| C05 | Capability parents form a cycle | CORE004 error |
| C06 | Duplicate YAML `status` key | CORE001 parse rejection |
| C07 | Unknown `intentset.truh` field | CORE001 schema error |
| C08 | Draft unattached rule | CORE009 warning |
| C09 | Retired replacement points to self | CORE004 error |
| V01 | Two slices implement same approved behavior | VSA001/CORE006 error |
| V02 | Relative deep import bypasses alias | VSA003 error |
| V03 | Contract import absent from `dependsOn` | VSA004 error |
| V04 | A → B → A import cycle | VSA005 error; exception stays visible |
| V05 | Two path claims resolve same source file | VSA009 error |
| V06 | Nonempty path claim matches no file | VSA009 error |
| V07 | Shared data resource with one owner, two consumers | Ownership pass |
| V08 | Foreign composition screen imported by a slice | TS003 error |
| V09 | Type-only backend resource import without approved ADR | AMP001 error |
| V10 | UI invokes backend SDK directly | AMP002 error |
| V11 | Shared imports infrastructure | Region boundary error |
| V12 | Infrastructure imports neutral shared types | Region boundary pass |
| V13 | Named Router directly imports a screen | TS003 exemption pass |
| V14 | Feature client imports only the permitted response parser | AMP001 named exception pass |
| E01 | Pass matches commit and graph hash | Current pass candidate |
| E02 | Pass has old commit or old graph hash | Stale; CORE007 at L3 |
| E03 | Skip/error/missing run | Not verified; CORE007 at L3 |
| E04 | Prior pass followed by current fail | Fail remains visible |
| P01 | Draft customer knowledge selected for publication | CORE008 rejection |
| P02 | Public knowledge links excluded internal title | CORE008 rejection; no leaked title |
| P03 | Release or role mismatch | Exclude before retrieval/rendering |
| P04 | Governing rule changed after knowledge review | Mark needs-review; block current publication |
| P05 | Customer query requests engineering raw context | Deny; use authorized publication index |
| P06 | Missing visibility/availability | Fail closed |

Reports must distinguish automated checks from review assertions, and conformance level from draft-readiness. The schema is not sufficient to validate a complete graph.
