# ADR 0030: An architecture profile is data a team writes, and the language readers are built in

**Status:** accepted, 2026-11-27 (issue #158). Proposed 2026-11-27. The thirteen decisions under "Decided" were made
by the maintainers the same day. The contract it describes is `spec/profile-contract.md`, which arrived with its cases
and its implementation; the rename of TS007, the Next.js profile and the Python reader are the steps still to come.

## Context

Traceable VSA is language-neutral. Its rules about imports and layers need a profile before a tool can check them: VSA
§5 says a profile MUST provide a concrete allowed matrix. There is one profile,
`spec/profile-typescript-amplify-gen2-0.3.md`, and `@intentset/architecture` implements it directly. A team on any
other stack gets the records and the drift check, and no architecture enforcement. Intentset will not be adopted
mainly by Amplify teams; the maintainers expect Python, Java and Rust, and others after them.

The implementation is already in three parts, though nothing names them:

- **What every stack shares.** Claims and ownership, regions, cross-slice dependencies and cycles, exceptions, the
  baseline, and the layer check itself (`claims.ts`, `regions.ts`, `dependencies.ts`, `exceptions.ts`, `baseline.ts`,
  `layers.ts`). These read a graph of files and imports and never look at syntax.
- **What reads TypeScript.** Which files import which, which names each import takes, and which file a specifier
  resolves to (`extract.ts`, `resolve.ts`, `tsconfig.ts`, `typescript.ts`), with TS001 to TS008.
- **What knows Amplify.** The backend root, the schema bridge, resource ownership and areas (`areas.ts`,
  `ownership.ts`, the schema half of `extract.ts`), with AMP001 to AMP013.

Much of what a team would want to change is data already. `.intentset/architecture.yaml` holds the layer matrix, the
package policy, and the patterns for shared, infrastructure, composition and tests, each with the reference profile's
value as its default. What is fixed in code is the language and the stack's own rules.

A CI gate that passes or fails a merge is the wrong place to load code from a third party. Design invariant 7 says the
architecture check executes no code, reaches no network and changes nothing, and an adopter relies on that when it
makes the check required.

No language the maintainers named needs code to be run. Python declares its imports in `import` and `from` statements
and its layout in directories and `pyproject.toml`. Java declares them in `import` statements, with the package equal
to the directory. Rust declares them in `use` and `mod` items, with the crate graph in `Cargo.toml`. What cannot be
read from source in each (an `importlib` call, a Gradle script, a macro that writes a `use`) is the same kind of thing
as a computed `require` in TypeScript, which the check already reports as not checked.

## Decided

1. **A profile is data, and the language readers are built into Intentset.** No profile is a package the check loads.
2. **The contract is a specification of its own**, not a section of VSA and not only an interface in the code.
3. **TypeScript with Next.js is the first new profile.**
4. **Python is the second language**, to show the contract is not TypeScript-shaped.
5. **A profile file may extend one profile Intentset ships, one level deep.** It states what differs. It may not
   extend another team's profile, so there is never a chain to trace.
6. **The package policy takes a language-neutral code now**, in place of TS007. Every language has the rule, and a
   Python repository reporting a `TS` code would be told something false about itself.
7. **The first Next.js rule set has four rules**: the server and client boundary, routes as composition, server
   actions and route handlers as the seam, and no data access in middleware.
8. **A profile names its own layers and says which play the fixed roles.** The seam is the one layer that may reach a
   backend or an outside service, the pure layers stay free of SDKs and UI, and the rendering layers may render. A
   check reads a role from the profile and never recognizes a layer by its name.
9. **Intentset ships a plain profile for each language it reads**: the layers, the matrix and the layout, with no
   stack's rules. A stack's profile, the Amplify one and later the Next.js one, is the plain profile with what the
   stack adds, and a team's profile extends whichever shipped one fits.
10. **A team's profile lives at `.intentset/profile.yaml`**, used when present. One repository has one profile.
11. **A profile file with an error stops the check with the profile's errors and nothing else.** No other profile
    stands in for it, no finding of any other profile is reported, and the result fails. A language with no reader
    is such an error, naming the languages read.
12. **A profile holds policy and layout, and facts about one repository stay in `.intentset/architecture.yaml`.**
    `scope`, `areas`, `routerFiles`, `responseParserModules`, `schemaBridge`, `sharedBackend` and `conditions` are
    each an error in a profile file. The architecture configuration accepts everything it did and still overrides
    the profile.
13. **A portable rule gives the seam and pure roles meaning under every profile.** A package the profile lists in
    `outsidePackages` is imported only from the seam layer and never from a pure layer: VSA015, stated in VSA §5.
    The reference profile lists none, so no existing case changes.

## Decision

**A profile is a file. It names a language Intentset reads, the layers and their matrix, the layout, and which of
Intentset's rule sets apply. The check reads it and executes nothing.**

### What a profile says

- **Its identity**: an ID and a version, as the reference profile has (`intentset/typescript-amplify-gen2/0.3`). A
  team's own profile takes an ID under a name the team owns.
- **Its language**: one of the readers this release of Intentset ships. A language it does not ship is a
  configuration error that names the languages it does, never a silent pass.
- **Its layers and matrix**: the layer names a slice may declare and which layer may import which (VSA §5). This is
  the one thing VSA requires of every profile.
- **Its package policy**: the packages each layer may not import.
- **Its layout**: the default patterns for source roots, shared, infrastructure, composition, tests and ignored
  output, and the folders that stand for a layer in a slice that declares none.
- **Its rule sets**: the stack-specific checks Intentset ships that this profile turns on, with their settings. The
  Amplify rules are one set; the Next.js rules will be another.

A team's profile file may name one profile Intentset ships as the one it extends, and then holds only what differs:
a list or a mapping it states replaces the shipped one whole, and nothing is merged entry by entry, so a reviewer
never has to work out what a combination means. One level is a limit on a repository's file: it extends a shipped
profile and never another repository's. A shipped stack profile is written as its language's plain profile with what
the stack adds, and is complete when shipped, so a team that extends it is still one level from something whole.

A repository's profile is the file at `.intentset/profile.yaml`. Everything `.intentset/architecture.yaml` may set
today stays settable there and overrides the profile, so a repository's configuration keeps its meaning. With no
profile file, the reference profile applies, as now. A profile file with an error is never applied in part and no
other profile stands in for it: the check stops with the file's errors.

### What a reader is

A reader is the part of Intentset that knows one language. It answers three questions and nothing else:

- which files are source, and which names each exports;
- which files each file imports, and which names it takes, type-only or not;
- which file each specifier resolves to, and how (relative, alias, workspace package, external package).

A reader reads source files and the data files that configure resolution (`tsconfig.json`, `pyproject.toml`,
`Cargo.toml`). It never runs the repository's code, its build scripts or its tools: no `python`, no `cargo metadata`,
no Gradle. What it cannot follow it returns as unresolved, with the reason, and the check reports it as not checked
(design invariant 6). A reader may be approximate at the edges; it may not guess.

The reader for TypeScript is today's code, moved behind that interface. The interface is internal to
`@intentset/architecture`: it is how Intentset adds a language, not a way for a repository to add one.

### Codes

A profile file defines no diagnostic code, because it holds no check of its own. A violation of its matrix is VSA006
whatever the profile, and of its list of outside packages VSA015. A violation of its package policy is to be a VSA
code too: the rule that is TS007 today becomes VSA016, stated in VSA §5 beside the matrix, and TS007 is retired and
never reused. (This record first gave the rename VSA015. Decision 13's rule took that number when it landed first, so
the rename is renumbered VSA016.) Each reader owns a prefix for the rules only its language has (`TS`), and each rule set owns
one (`AMP`). The contract's specification holds the register of prefixes, so two never collide, and
`test/codes.test.ts` holds the register to the code as it holds every other code.

### The contract's specification

`spec/profile-contract-<version>.md` says what a profile file may hold, what a reader must return, and what a checker
must do with both. It arrives with:

- conformance cases for a profile file (a valid one, one case per way it can be wrong, a profile naming a language
  the checker does not read);
- the reference profile written as a profile file, with **every existing VSA, TS and AMP case passing unchanged**.
  That is the test of the seam: if a case has to change, the contract is wrong, not the case;
- a guide to writing a profile, on intentset.org and in the repository.

### Order of work

1. The reader interface, with the TypeScript reader moved behind it. A refactor: no case and no diagnostic moves.
2. The contract's specification, the profile file with its one level of extension, and the reference profile as
   data. Still no existing case moves, so `intentset.spec` stays `0.3`, and the seam is proved before anything is
   renamed.
3. TS007 becomes VSA016. This is the one breaking change: existing cases, exceptions and baseline entries name the
   code, so `intentset.spec` moves to `0.4` and `intentset migrate --to 0.4` rewrites the code where a repository
   wrote it. It is a step of its own so that the move carries nothing else.
4. TypeScript with Next.js: a profile file and a Next.js rule set. It reuses the TypeScript reader, so it tests the
   profile file and the rule-set seam.
5. Python: a second reader and a plain Python profile. It tests the reader interface.
6. Java, then Rust, each a reader and a first profile, in the order adopters ask for them.

### The Next.js rule set

Four rules, each with a code under a prefix the rule set owns, defined in the profile's specification:

- **The server and client boundary.** A client component, a file that says `"use client"` or is imported by one,
  takes nothing from server-only code, and server-only code stays out of what a client component imports.
- **Routes are composition.** Files under the application router (pages, layouts, route handlers) wire slices
  through their entrypoints and hold no business behavior of their own (VSA §6).
- **Server actions and route handlers are the seam.** A slice reaches a database or an outside service only from
  its server actions or handlers, never from its UI (VSA §7).
- **No data access in middleware.** Middleware may coordinate access; it imports no slice's internals and calls no
  database.

## Rejected

- **A profile as a package the check loads.** Any stack would be possible without waiting for a release. It would
  also put third-party code inside a required CI check in every adopter's repository, and design invariant 7 would no
  longer be true of the command adopters trust most.
- **A reader described in the profile file**, as patterns for a language's import statements. It would let a team add
  a language without a release and still run no code. A pattern cannot tell an import from the same text in a comment
  or a string, or follow one across lines, and a reader that is wrong is wrong silently.
- **The contract as a section of VSA.** VSA would gain tooling detail and would move each time the contract did.
- **An interface in the code and no specification.** A second implementation would have nothing to conform to, which
  is what the specifications are for.
- **Plain TypeScript as the first new profile.** It is the cheapest proof of the seam. Next.js is a stack teams
  actually run, and Python is what proves the contract is not TypeScript-shaped, so the cheap proof adds little.

## Consequences

- A team on a language Intentset reads writes its own profile as a file, reviewed like any other change.
- A team on a language Intentset does not read waits for a release. That is the price of the check running no code.
- A reader without its language's compiler is approximate where the language is dynamic or generated. Each reader's
  specification lists what it cannot follow, and each such import is reported, not passed.
- The TypeScript reader keeps using the TypeScript compiler as a peer dependency. A reader for another language is
  written without a dependency first; a parser as a dependency is a separate decision when precision calls for it.
- Design invariant 7 is unchanged.
- Adopters migrate once more, to `0.4`, for a renamed code. Doing it now, before a second language exists, means no
  repository on another language ever reports a `TS` code.

## Open, for the contract's specification

- Settled by the contract (`spec/profile-contract.md` §2): a profile file's keys are `id`, `extends`, `language`,
  `layers`, `roles`, `layerMatrix`, `layerFolders`, `forbiddenPackages` and `ruleSets`, and every key the
  architecture configuration has.
- What "server-only code" is to the Next.js rule set where a file does not say so itself.
