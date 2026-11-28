# Writing a profile

A profile tells `intentset architecture check` how your code is laid out: your layers, which may import which, and
where things live. It is one file, `.intentset/profile.yaml`, and it holds no code. The rules are in
[the profile contract](../spec/profile-contract.md); this page is the short way in.

Without the file, the reference profile applies (TypeScript with AWS Amplify Gen 2), as it always has.

## Start from one Intentset ships

Extend a shipped profile and state only what differs. For a TypeScript codebase that is not on Amplify:

```yaml
id: acme/web/1
extends: intentset/typescript/0.4
layers: [ui, app, domain, adapters]
roles:
  seam: adapters      # the one layer that may reach a backend or an outside service
  pure: [domain]      # layers that stay free of SDKs, transport and UI
  rendering: [ui]     # the layers that may render
layerMatrix:
  ui: [app, domain]
  app: [domain, adapters]
  domain: []
  adapters: [domain]
layerFolders:
  domain: [domain]
  adapters: [adapters]
forbiddenPackages:
  domain: ["react/**"]
  adapters: ["react/**"]
outsidePackages: ["pg/**", "stripe/**"]   # only the seam may import these, and never a pure layer
```

Each slice then declares its layers by those names:

```yaml
  slice:
    layers:
      ui: [src/features/orders/ui/**]
      app: [src/features/orders/app/**]
      domain: [src/features/orders/domain/**]
      adapters: [src/features/orders/adapters/**]
```

## A Next.js application

Extend the Next.js profile and list the packages that reach a database or an outside service:

```yaml
id: acme/shop/1
extends: intentset/typescript-nextjs/0.4
outsidePackages: ["@prisma/client/**", "stripe/**"]
```

Routes under `app/` and `middleware.ts` are composition, and four rules run (NEXT001 to NEXT004): client code never
imports server-only code or one of those packages, and neither a route file nor middleware imports one. A file is
client code when it opens with `"use client"` or client code imports it, and server-only when it imports
`server-only` or sits under a `server/` folder or is named `*.server.ts`. A file that says neither is not judged,
and the check says how many were not.

## Which file a key belongs in

A profile says what is true of a stack, so several repositories could share it. What is true of one repository goes
in `.intentset/architecture.yaml`, which overrides the profile.

| In `.intentset/profile.yaml` | In `.intentset/architecture.yaml` only |
|---|---|
| `id`, `extends`, `language`, `layers`, `roles`, `layerFolders`, `ruleSets` | `scope`, `areas` |
| `layerMatrix`, `forbiddenPackages`, `outsidePackages` | `routerFiles`, `responseParserModules`, `schemaBridge` |
| `sourceRoots`, `shared`, `infrastructure`, `composition`, `tests`, `ignore` | `sharedBackend`, `conditions` |
| `backendRoots`, `backendSdks`, `screensGlob`, `serverOnly`, `middlewareFiles` | |

Every key in the left column but the first row may also be set in `.intentset/architecture.yaml`. A key from the
right column in a profile is an error.

## What to know before you change it

- **A key you state replaces the shipped one whole.** Nothing is merged. That is why the example states the matrix,
  the roles, the folders and the package policy again: each named the shipped profile's layers.
- **Roles, not names, carry meaning.** Call your layers what your team calls them, and say which is the seam, which
  are pure and which render.
- **`.intentset/architecture.yaml` still works** and overrides the profile. Keep what is true of one repository
  there, such as its scope.
- **`outsidePackages` is what gives the seam and pure roles teeth.** List the packages that reach a database or an
  outside service; an import of one outside the seam, or in a pure layer, is VSA015.
- **A mistake in the file stops the check.** It reports the profile's errors (CFG001) and checks nothing else until
  they are fixed.
- **The check reads TypeScript and JavaScript.** A profile for another language is such an error until a release
  reads it.

Run `intentset architecture check` after each change. It reports what it could not check as well as what it found.
