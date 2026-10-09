---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/slice/0.1
  id: SLICE-ASK
  type: slice
  title: The chat on intentset.org
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    implements: [BEH-ASK-ANSWER, BEH-ASK-NOT-IN-DOCS, BEH-ASK-CONTACT, BEH-ASK-LIMITS, BEH-ASK-KEEP-QUESTION, BEH-QUESTIONS-REPORT]
  slice:
    kind: product
    domain: site
    entrypoints: [amplify/functions/ask/index.ts]
    layers: {}
    claims:
      - kind: source
        path: amplify/functions/ask/**
      - kind: source
        path: site/chat/**
      - kind: backend
        path: amplify/backend.ts
      - kind: backend
        path: amplify/settings.ts
      - kind: verification
        path: amplify/test/**
    usesResources: []
---

# The chat on intentset.org

## Responsibility

Planned owner of the chat: the answer function in `amplify/functions/ask/`, the backend that deploys it (the API Gateway API with response streaming, the regional web application firewall, the questions and limits tables, the function's reserved concurrency and its access to Bedrock), and the panel's script in `site/chat/`. The corpus the function answers from is built by the site from the same commit. Nothing is built yet: the slice is a draft, and its entrypoint and claims are planned paths, which Intentset reports as warnings until the slice leaves draft (VSA §3). Layers and resources are empty until the code exists.

## Public contract

The API the panel calls, `POST /ask`, streaming the answer. No contract record yet.

## Verification

Planned: unit tests under `amplify/test/` against an in-memory store and a stubbed model, the site's browser tests for the panel, and a fixed set of questions with the sources each answer should cite.

## Sources

- The chat proposal and its decisions, 2026-10-09: the implementation tracker for the chat on intentset.org.
