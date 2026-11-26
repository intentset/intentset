# @intentset/publisher

Publishes reviewed knowledge for one reader, in one or more audiences and roles, on one release
(`spec/publication.md`): it projects the graph deny by
default, checks that no excluded record's title or path leaks, and writes Markset documents with their provenance,
an index, retrieval chunks, `help.json`, the tips a product shows beside its controls, and `snapshot.json`, the one
file that names the commit and graph hash it was published from.

## Install

```sh
npm install @intentset/publisher
pnpm add @intentset/publisher
```

## Example

Most repositories publish through the CLI, `@intentset/cli`:

```sh
npx -p @intentset/cli intentset publish --visibility customer --audience teacher --product PRD-LANTERN \
  --release pilot-1 --role teacher --edition standard --out published/ --html
```

With pnpm, `pnpm dlx --package=@intentset/cli intentset …`, or `pnpm exec intentset …` once `@intentset/cli` is
installed. The command is always `@intentset/cli`'s: this package has no `intentset` binary, and npx asked
for `intentset` alone would fetch an unrelated unscoped package from the registry.

From code, `publish(graph, registries, request, { snapshot, publishedAt })` returns the documents, the documents kept
under review (`keptUnderReview`), the index, the help file, the snapshot file and the diagnostics, and refuses the whole request when any field is missing or undeclared
(PUB001). A request is for one reader: `audience` and `role` are each one value or a list of every one the reader holds
(the CLI repeats `--audience` and `--role`), read as a set, while `product`, `release` and `edition` are one value
each. Every file names the request's audiences, roles and flags as sorted lists, and they are held all-of: serve the
publication only to a reader who holds every value it names, and publish once for each combination you serve. The
index's `request` is the request in canonical form, so key any cache on `canonicalJson(index.request)`. The snapshot, the commit and graph hash the run read, is named in `snapshot.json` and nowhere else; each
document pins what it was made from by its sources' hashes. So publishing the same knowledge at two commits writes
the same bytes in every file but that one.

`renderHtml: "page"` (or `true`) adds each document's complete HTML page, stylesheet inlined, as `html`;
`renderHtml: "fragment"` adds `htmlFragment` instead, the page's content without its title heading, for a product that
shows the article inside its own interface. The fragment is sanitized as the page is and carries no provenance: that
is on the document's `publication`. Neither passes raw HTML through, and a link or image written in the knowledge
keeps its URL only when the scheme is `http`, `https` or `mailto`, or there is none. A protocol-relative URL
(`//host/x`) has none, and resolves against the scheme of the page that shows it. A diagram drawn from a captioned
figure is embedded as a `data:image/svg+xml` image that Markset's renderer builds, with the source's text escaped: a
product whose Content Security Policy restricts `img-src` must allow `data:` to show it.

**Knowledge kept under review.** Knowledge whose sources changed what they promise is needs-review and is not
published as current. When the request sets `keepUnderReview` (the CLI's `--keep-under-review`; off by default),
knowledge that is keepable is published anyway, from the text its last review covered, which the review's `self` pin
proves, and only when no source changed who may see it, which its `gates` pin proves (publication §3, ADR 0027). Such
a document is written at `under-review/<ID>.md`, apart from the current documents, listed in `keptUnderReview` and the
index's `keptUnderReview`, never in `documents` or `index.published`, and never chunked for retrieval. It is marked:
its `intentset-publication` block carries `underReview: true` and `changedSinceReview` (the admitted sources that
changed, and a count of the others), its body carries the fixed note `UNDER_REVIEW_NOTE` right after its title, and its
HTML page carries `noindex`. In the help file its entry and tips carry `underReview: true`, and a tip keyed to a rule is
held back, listed in `withheldForReview`. Anything that shows such a document or tip must show that it is under review.
Knowledge that is not keepable stays excluded, with a CORE008 that says which condition failed.

**When the output is committed.** Publish with `--no-snapshot`, or ignore `snapshot.json` in version control. The
commit it names is the one checked out when the command ran, which is never the commit that will contain the output,
and it differs on every branch that changed a record, so branches would conflict on it. Git already records where
committed output came from. Keep the file when the output is deployed or handed to another system: nothing else says
which state of the model the documents were made from.
`@intentset/help` reads the help file in the product.

## Learn more

Part of [Intentset](https://intentset.org/), which keeps product intent connected to the code that delivers it and the
checks that verify it, as readable Markdown files in a repository. The specifications are at
https://intentset.org/specifications/ and the source at https://github.com/intentset/intentset.

## Licence

MIT
