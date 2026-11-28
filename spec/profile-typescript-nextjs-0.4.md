---
title: TypeScript + Next.js Profile v0.4
id: intentset/typescript-nextjs/0.4
status: draft
revision: 2026-11-27
implementation: 0.18.0
---

# TypeScript + Next.js Profile v0.4

Implements [Traceable VSA](vsa-0.4.md) under the [profile contract](profile-contract.md), and follows [Core](core-0.4.md) §1's change policy. Rules below are Intentset decisions, not requirements imposed by Next.js. This profile says what `intentset architecture check` checks in a TypeScript application built on the Next.js application router; it installs and configures nothing. The decision is [ADR 0030](https://github.com/intentset/intentset/blob/main/docs/decisions/0030-a-profile-is-data-and-the-readers-are-built-in.md).

## 1. The profile

The profile this document specifies is `intentset/typescript-nextjs/1`. Its version is its own (profile contract §8): this document's `id` carries the specifications' version, and the profile's does not. It is the plain TypeScript profile with the `nextjs` rule set and the application router's layout:

| Key | Value |
|---|---|
| `ruleSets` | `[nextjs]` |
| `sourceRoots` | `src/**`, `app/**`, `middleware.ts` |
| `composition` | `app/**`, `src/app/**`, `middleware.ts`, `src/middleware.ts` |
| `middlewareFiles` | `middleware.ts`, `src/middleware.ts` |
| `serverOnly` | `**/server/**`, `**/*.server.ts`, `**/*.server.tsx` |
| `outsidePackages` | `pg`, `mysql2`, `mongodb`, `mongoose`, `@prisma/client`, `drizzle-orm`, `sequelize`, `typeorm`, `knex`, `better-sqlite3`, `redis`, `ioredis`, `firebase-admin`, `stripe`, `nodemailer` and `@aws-sdk/*`, each with its subpaths |

Its layers, their roles, their matrix and the package policy are the plain TypeScript profile's. Its `outsidePackages` is a starting point, so that NEXT002 to NEXT004 and VSA015 judge something before a team has said anything: well-known clients for a database or an outside service, and no general HTTP helper. A team is expected to replace it with the packages its own product reaches through, in its profile or in `.intentset/architecture.yaml`; a list stated replaces this one whole.

`serverOnly` and `middlewareFiles` are lists of path patterns (VSA §3). Both are settings of this rule set that a profile or `.intentset/architecture.yaml` may state, and a value stated replaces the one beneath it whole (profile contract §4).

## 2. The rules

| Rule | Requirement |
|---|---|
| NEXT001 | Client code MUST NOT import server-only code (§3) |
| NEXT002 | A route file MUST NOT import a package the profile lists as reaching outside (§4) |
| NEXT003 | Client code MUST NOT import a package the profile lists as reaching outside (§5) |
| NEXT004 | A middleware file MUST NOT import a package the profile lists as reaching outside (§6) |

Each is an error. The rules of Traceable VSA and of the `typescript` reader apply as under every TypeScript profile, and §4 to §6 say which code reports what, so that one import is reported once.

## 3. Client code and server-only code

A **directive** is one of the string statements a file opens with. The same string anywhere after the first statement that is not a string is an expression, and says nothing.

A file is **client code** when it opens with the directive `"use client"`, or when client code imports it. The second holds however far down: what a client file imports is client code, and so is what that imports.

A file is **server-only** when it imports the package `server-only`, or when its path matches a `serverOnly` pattern.

A file that opens with `"use server"` holds **server actions**. It runs on the server, and client code MAY import it: the import becomes a call across the network and puts none of the file's code in the browser. So what makes a file client code does not pass through a server action, and what a server action imports is not client code on its account.

NEXT001: client code MUST NOT import a server-only file, and MUST NOT import the `server-only` package. A file that opens with `"use client"` and matches a `serverOnly` pattern is NEXT001 too, since it says it is both. A type-only import is erased before anything runs, so it neither makes a file client code nor breaks this rule.

A file that is none of these, with no directive, no import of `server-only`, no pattern that matches it and no client code importing it, is **not judged**. A checker MUST NOT report it as passing: it MUST say for how many files the boundary was not judged and name some of them, as it does for anything it could not check (VSA §2).

## 4. Routes are composition

Files under the application router, `app/**` or `src/app/**`, are composition (VSA §6): pages, layouts and route handlers wire slices together and hold no business behavior of their own.

- A route file that imports a slice's private file is VSA003, as for any composition. The rule set adds no code for it.
- NEXT002: a route file MUST NOT import a package the profile lists in `outsidePackages`. It reaches data by calling a slice through its entrypoint, and the slice's seam reaches the package. Type-only imports count, as they do for VSA015.
- Whether a route file holds business behavior that no import shows stays VSA007, a review assertion.

## 5. The seam

The seam is the layer the profile gives the seam role (profile contract §3), and VSA015 is its rule: a package in `outsidePackages` is imported only from the seam layer, and never from a pure layer. In a Next.js application the seam is a slice's server actions and route handlers.

VSA015 cannot see where a file runs. NEXT003: client code MUST NOT import a package in `outsidePackages`, by a value import. It reports what VSA015 does not: a seam file that is client code, because a `"use client"` file reaches it with no server action between, and a shared or infrastructure file that client code imports. Where VSA015 reports an import, outside the seam or in a pure layer, NEXT003 does not report it again.

## 6. Middleware

A middleware file is one a `middlewareFiles` pattern matches. It is composition: it may coordinate access, and it may call a slice through its entrypoint.

- NEXT004: a middleware file MUST NOT import a package the profile lists in `outsidePackages`. NEXT002 does not also report it.
- A middleware file that imports a slice's private file is VSA003.

## 7. Conformance fixtures

The cases are in `tests/vsa.json`, each named `NEXT…`, over the scheduling example under a profile that extends this one. They cover, for each rule, an import it reports, the boundary beside it, and the import another code reports in its place; a directive that is not a first statement; `serverOnly` replaced by the architecture configuration; the same tree under the plain TypeScript profile, where the rule set does not run; and a tree in which no file says anything.
