# ADR 0001: The frontmatter reader is Intentset's own, and strict

**Status:** accepted, 2026-10-02

## Context

Core §3 requires the carrier to reject duplicate keys, custom tags, merge keys, anchors and aliases, and non-finite
numbers, and to bound file size, nesting and parser work. Markset's `parseYamlSubset` is a tolerant reader for its own
two keys: a duplicate key wins silently and a flow map is kept as raw text. That is right for Markset and wrong here. A
general YAML library can be configured to be strict but adds a dependency and a far larger grammar than the carrier uses.

## Decision

`@intentset/core` carries a strict reader for the subset the carrier needs: block mappings, block and flow sequences,
plain, single-quoted and double-quoted scalars, integers, booleans, null, and comments. Everything else is an error with
a line number: duplicate keys, anchors, aliases, tags, merge keys, flow mappings, block scalars, multi-document streams,
tabs as indentation. Limits: 256 KiB of frontmatter, nesting depth 16, 4096 lines. The adapter hands the reader the
yaml node's raw text, so Markset still owns finding the fence.

## Consequences

Two readers exist across the two projects, each the size of its own contract. If Markset's expansion backlog
([`docs/requirements/markset/`](../requirements/markset/implementation-backlog.md)) lands a strict mode, the adapter
can delegate without changing core's API. Fixture C06 and the unsafe-YAML cases in the catalog are this reader's
conformance cases.
