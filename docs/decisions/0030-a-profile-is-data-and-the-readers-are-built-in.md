# ADR 0030: An architecture profile is data a team writes, and the language readers are built in

**Status:** proposed, 2026-11-27 (issue #158). The four decisions under "Decided" were made by the maintainers on
2026-11-27; the rest is the proposal built on them and waits for acceptance. No specification, conformance case or
export moves with this record: the contract it describes arrives as a specification of its own, in the same commit as
its cases and its implementation.

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

A repository names its profile in `.intentset/architecture.yaml`, either by the ID of one Intentset ships or by the
path of a profile file in the repository. Everything that file may set today stays settable there and overrides the
profile, so a repository's configuration keeps its meaning. With no profile named, the reference profile applies, as
now.

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
whatever the profile. Each reader owns a prefix for the rules only its language has (`TS`), and each rule set owns
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

1. The contract, the reader interface and the reference profile as data. No case changes and no diagnostic moves, so
   `intentset.spec` stays `0.3`.
2. TypeScript with Next.js: a profile file and a Next.js rule set. It reuses the TypeScript reader, so it tests the
   profile file and the rule-set seam.
3. Python: a second reader and a plain Python profile. It tests the reader interface.
4. Java, then Rust, each a reader and a first profile, in the order adopters ask for them.

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

## Open, for the contract's specification

- Whether a profile file may extend another, so a team's profile is the few lines that differ from one Intentset
  ships.
- Whether TS007, the package policy, keeps its code. It is a rule every language has, carrying one language's
  prefix. Renaming it invalidates existing cases, so it would move `intentset.spec`.
- The Next.js rule set's rules: at least which code may run on the server, and which files a route may import.
