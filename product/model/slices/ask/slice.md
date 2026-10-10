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
  revision: 5
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
      - kind: source
        path: amplify/questions/**
      - kind: backend
        path: amplify/backend.ts
      - kind: backend
        path: amplify/settings.ts
      - kind: verification
        path: amplify/test/**
      - kind: verification
        path: amplify/eval/**
    usesResources: []
---

# The chat on intentset.org

## Responsibility

Owner of the chat: the answer function in `amplify/functions/ask/` (parsing and admitting a question, the prompt and the corpus as cited documents, Claude on Bedrock at low effort (Sonnet 4.6 until Anthropic approves the account for Opus 5.5, which comes with a refusal fallback to Opus 4.8), the cost against the day's budget, and the scrubbed record kept for 90 days), the questions report in `amplify/questions/` (`pnpm run questions:report`: a pure renderer over the stored records, and a command that reads the table read-only and writes the report or the gaps brief to standard output), and the backend in `amplify/backend.ts` that deploys it: the API Gateway REST API that streams the answer, the regional web application firewall in front of it, the limits and questions tables, the function's reserved concurrency and its access to Bedrock. The panel in `site/chat/`: a launcher and a non-modal dialog that streams the answer, renders it as DOM nodes with its sources, says each refusal in words, and keeps the conversation in the tab's sessionStorage; it is built into the site only when `ASK_URL` is set. The corpus the function answers from is built by the site from the same commit (`pnpm run corpus`), with the knowledge records of Intentset's own model that `intentset publish` releases to the public, and no other. Layers are empty: the profile's layer matrix is not applied to this slice yet, which the check reports (VSA006). It uses no resources from a registry.

## Public contract

`POST /ask` on the API, from the allowed origin only: a JSON body with a conversation id, the question and the conversation so far, answered as newline-delimited JSON events (`text`, `sources`, `done`, `refused`, `error`), streamed. No contract record yet.

## Verification

`amplify/test/`: the answer flow against an in-memory store and a stubbed model (every behavior, every limit, and that no question, answer or address reaches a log), the scrubbing and the request parser, the questions report against fixture records and its refusal without credentials (`amplify/test/questions.test.ts`), the panel in Chromium against a stub of the API (`site/test/chat.test.ts`), and two synths of the backend, as a sandbox and as the branch, read for the streaming integration, the firewall, the tables' expiry, the reserved concurrency and the Bedrock grants. An agent sandbox was deployed and exercised on 2026-10-09: preflight, origin refusal, limits and the stored record worked; the model call was refused by the organization's Region deny, which is still being opened. The eval in `amplify/eval/` (`pnpm run chat:eval`) runs a fixed set of questions, each with the sources or outcome a right answer has, through the function's own answer flow and model against Bedrock, with an in-memory store; it is run before any change to the prompt or the model, and its table goes in the pull request. No verification records yet.

## Sources

- The chat proposal and its decisions, 2026-10-09: the implementation tracker for the chat on intentset.org.
