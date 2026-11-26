---
markset: 0
---

# What reads an Intentset model

{.lead}
A model in your repository can be read two ways. Which one a tool uses decides what your repository has to publish for it.

## Reading the repository's records

The tool reads the records in the scope `.intentset/config.yaml` names (`product/` unless you changed it) at a commit, through your code host, and the run records your CI publishes. No export is involved. Your repository grants the tool read access to its contents and keeps its run records where the tool can fetch them.

## Reading the export

The tool reads one JSON document your CI writes with `intentset graph`, and checks it with `readExport` from `@intentset/core`, which rejects an export it cannot trust and says why. Restricted records are left out and every omission is counted. The conformance suite carries the export envelopes a reader must accept or reject: see [the export contract](../../specifications/export/) and [conformance](../../conformance/).

There are no conformance cases for the repository path yet.

## Two readers from the same family

- **Streamlane** · Product · In development. A work management product. It reads the repository's records and published run records.
- **Driftline** · Product · In planning. A product that watches how a product is used. It reads the export.

Neither is released. [The adoption log](../../pilot/) records what Intentset has done in both.
