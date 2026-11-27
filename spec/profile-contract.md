---
title: Intentset Profile Contract v0.1
id: intentset/profile-contract/0.1
status: draft
revision: 2026-11-27
implementation: 0.18.0
---

# Intentset Profile Contract v0.1

Implements [Traceable VSA](vsa-0.3.md) §5, which says a profile MUST provide a concrete allowed matrix, and follows [Core](core-0.3.md) §1's change policy. This contract says what a profile is, what a team may write in one, and what a checker does with it. [The reference profile](profile-typescript-amplify-gen2-0.3.md) is one profile under this contract. The decision is [ADR 0030](https://github.com/intentset/intentset/blob/main/docs/decisions/0030-a-profile-is-data-and-the-readers-are-built-in.md).

## 1. What a profile is

A profile is data. It names the language a repository's code is read in, the layers a slice may have and which may import which, the roles some of those layers play, the layout, and the stack-specific rule sets that run. A checker reads a profile. It MUST NOT load or execute code a profile names, and a profile has no way to name any: checking a repository against a profile runs nothing, reaches no network and changes nothing.

Three things are not in a profile, because they are the checker's:

- **A reader** (§6) knows one language: which files are source, what each imports, and where each specifier resolves.
- **A rule set** (§5) is a group of checks for one technology stack, each with a code of its own.
- **The portable rules** are Traceable VSA's, and they apply under every profile.

A profile chooses among the readers and rule sets a checker has. It defines no check and no diagnostic code (§7).

## 2. The profile file

A repository has at most one profile of its own, at `.intentset/profile.yaml`, used when present. It is a mapping in Core §3's YAML subset with these keys and no others:

| Key | Holds |
|---|---|
| `id` | The profile's ID. Required |
| `extends` | The ID of the shipped profile it extends (§4) |
| `language` | The language the code is read in (§6) |
| `layers` | The names of the layers a slice may declare, in order (§3) |
| `roles` | Which layers play the seam, pure and rendering roles (§3) |
| `layerMatrix` | For each layer, the layers it may import; a layer always imports itself (VSA §5) |
| `layerFolders` | For each layer, the folders that stand for it in a slice that declares no layers (§3) |
| `forbiddenPackages` | For each layer, the patterns of the packages it may not import |
| `ruleSets` | The rule sets that run (§5) |
| every key of `.intentset/architecture.yaml` | The same value, read and checked the same way (§4) |

An `id` is two or more segments of lowercase letters, digits, hyphens and dots, joined by `/`, such as `acme/web/1`. IDs under `intentset/` name the profiles a release ships (§8), and a repository's file MUST NOT take one.

A profile that extends none starts from nothing: every file is in scope and every other value is empty. It MUST state `language`, `layers` and `layerMatrix`.

A file that is wrong in any way is CFG001 (Core §11) with origin `architecture`, one diagnostic per thing wrong, each naming the key and its line where there is one. The conditions are: the file does not parse; a key is not in the table; `id` is missing, malformed or under `intentset/`; a value has the wrong shape; and each condition §3 to §6 state. **A profile file is never applied in part.** When it has an error, a checker MUST report the errors and check the repository against the reference profile, so the result fails on the errors and nothing was judged by half a profile.

## 3. Layers and roles

`layers` is a list of unique names, each of lowercase letters, digits and hyphens. The names are the profile's own: `ui`, `handlers`, `domain`, whatever the team calls them.

A layer's name carries no meaning to a checker. Three roles do, and a profile says which of its layers play them:

| Role | Holds | Means |
|---|---|---|
| `seam` | one layer | The one layer that may reach a backend or an outside service (VSA §7) |
| `pure` | a list of layers | Layers that stay free of SDKs, transport and UI |
| `rendering` | a list of layers | The layers that may render an interface |

A role left out is played by no layer, and a rule that reads the role then judges nothing: with no rendering layer named, no layer is judged for rendering. A rule that reads a role MUST read it from the profile and MUST NOT recognize a layer by its name.

`layerFolders` maps a layer to folders under a slice's entrypoint directory, each one folder's path with no wildcard. A slice that declares no layers has, for the rules that read a role, the layers its folders stand for.

Every layer named in `layerMatrix`, as a key or as a target, in `roles`, in `layerFolders` and in `forbiddenPackages` MUST be in `layers`; each that is not is an error. These are judged on the whole profile, whichever file stated each part, so a profile that states `layers` anew states each of the four again where it named a layer the new list drops.

## 4. Extension, and the one order

A profile MAY extend one profile, by its ID in `extends`, and that profile MUST be one the checker ships (§8). An ID it does not ship is an error that names the ones it does. So extension is one level deep for a repository: its file extends a shipped profile, and no file extends another repository's.

A profile that extends one holds what differs. A key it states replaces the extended profile's value for that key whole; no list or mapping is merged entry by entry, so a reviewer reads the value that applies in one place. If it states `language`, the language MUST be the extended profile's.

The configuration a repository is checked with is resolved in one order, each later source replacing a key whole:

1. the shipped profile the repository's file extends, or nothing when it extends none; with no file, the reference profile;
2. the repository's profile file;
3. `.intentset/architecture.yaml`, which keeps every key it has;
4. what the caller of the checker hands in.

`.intentset/architecture.yaml` holds what is true of one repository under its profile: its scope, its named router file, its areas. It cannot set `id`, `extends`, `language`, `layers`, `roles`, `layerFolders` or `ruleSets`.

## 5. Rule sets

A rule set is a group of checks for one stack, written for one language. A profile turns a rule set on by naming it in `ruleSets`. Naming a rule set the checker does not ship, or one written for another language than the profile's, is an error.

A rule set that a profile does not name MUST NOT run, whatever else the configuration holds: a backend SDK listed in `backendSdks` under a profile without the rule set that reads the key is a package like any other.

This version defines one rule set:

| Rule set | Language | Rules |
|---|---|---|
| `amplify` | `typescript` | AMP001 to AMP013, [reference profile](profile-typescript-amplify-gen2-0.3.md) §4, §6 and §9 |

The seam and pure roles are read by this rule set (AMP001, AMP002, AMP006). Under a profile with no rule set, VSA010 stays a review assertion: unresolved until a reviewer asserts it, and never a pass.

## 6. Readers

A reader is the part of a checker that knows one language. For a tree of files it MUST say:

- which files are source in its language;
- for each source file, every reference to another module, with its line, whether it is type-only, dynamic or a re-export, and the names it takes;
- for each reference, the file it resolves to, or that it names a package outside the repository, and how it resolved.

A reader reads source files and the data files that configure resolution. It MUST NOT run the repository's code, its build scripts or its tools. A reference it cannot follow MUST be returned as unresolved with the reason, and a checker MUST report it as not checked; it is never dropped and never passed (VSA §2).

The rules only one language has belong to its reader and run whenever that reader does. For `typescript` they are TS001 to TS008 (reference profile §2 and §3), and TS008 reads the rendering role.

A profile whose language a checker has no reader for is an error that names the languages the checker reads. The checker MUST NOT report a pass for that repository.

This version names one language: `typescript`, which covers TypeScript and JavaScript.

## 7. Codes

A profile file defines no diagnostic code. A violation of its matrix is VSA006 under every profile.

Each specification owns the prefixes of the codes it defines, and a prefix belongs to one owner:

| Prefix | Owner |
|---|---|
| `CORE`, `CFG`, `EVID` | Core |
| `VSA`, `REG` | Traceable VSA |
| `PUB` | The publication profile |
| `TS` | The `typescript` reader |
| `AMP` | The `amplify` rule set |

A new reader or rule set takes a prefix no row holds, and adds its row here in the same change.

## 8. Shipped profiles

A checker ships profiles under `intentset/`, each complete when shipped. This version names two:

| ID | What it is |
|---|---|
| `intentset/typescript/0.3` | The plain TypeScript profile: the five layers of the reference layout, their matrix, the layout and the package policy, with no rule set |
| `intentset/typescript-amplify-gen2/0.3` | The reference profile: the plain TypeScript profile with the `amplify` rule set, the backend root `amplify/**` and the Amplify and AWS SDKs as `backendSdks` |

The reference profile applies to a repository with no profile file, so a repository that had none is checked exactly as before this contract.

Each language a checker reads has a plain profile, so a team on any stack in that language has one to extend. A stack's profile is its language's plain profile with what the stack adds.

## 9. Conformance fixtures

The cases are in `tests/vsa.json`, each named `PROFILE …`, over the scheduling example. They cover: a file that extends each shipped profile; a file that extends none; the order of §4; layers of a profile's own naming with each role read from the profile, and a role left out; a rule set turned off and on over the same tree; and one case for each error condition of §2 to §6. Every case of Traceable VSA and of the reference profile holds unchanged under this contract, with no profile file.
