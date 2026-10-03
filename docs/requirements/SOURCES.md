# Sources, provenance, and open decisions

Prepared 2026-10-02. The normative rules are proposed Intentset design decisions unless explicitly identified as an external platform fact.

## Primary project context

[Requirements Traceability Options](chatgpt-conversation://6abffbd1-a058-83e9-850c-7c7b70dbe9e6), retrieved through the conversation reader. Eight turns covered requirements traceability, granularity, the open framework, Markset integration, an architecture review, naming, and Coral Reef Ventures. The architecture rules in the VSA specification and the reference profile are proposed Intentset decisions. Assessment scheduling is illustrative, not confirmed product functionality.

## External references checked

- [AWS Amplify Gen 2 data setup](https://docs.amplify.aws/react/build-a-backend/data/set-up-data/): TypeScript schema, exported Schema, client generation/configuration pattern.
- [AWS Amplify Gen 2 function setup](https://docs.amplify.aws/react/build-a-backend/functions/set-up-function/): function resource/handler structure and backend composition.
- [TypeScript paths](https://www.typescriptlang.org/tsconfig/paths.html): aliases do not rewrite emitted imports.
- [Markset](https://markset.org): requested reference; website was not retrievable through the research tool. Markset-specific claims in this draft rely on the supplied conversation and are not an independently verified compatibility certification. Pin the upstream spec/parser at M0. No speculative new directives are used.

## Deliberate draft decisions

One authoritative Markdown carrier; `intentset` metadata namespace; exactly one accountable behavior slice; authored forward edges only; exact release matching; snapshot-bound evidence; fail-closed publication; optional ADR-approved type-only Amplify bridge; inherited Router-only screen exemption. These resolve alternatives in the conversation rather than pretending that every prior suggestion was already settled.

## Remaining decisions

Actual repository/configuration audit; Markset version/API compatibility; open-source license; repository/npm/domain identity; governance contacts; concrete pilot; reference dependency versions; production deployment and release process. Resolved 2026-10-02: the GitHub organization and npm organization are `intentset`, and intentset.org is owned.
