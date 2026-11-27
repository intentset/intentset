# Writing a profile

A profile tells `intentset architecture check` how your code is laid out: your layers, which may import which, and
where things live. It is one file, `.intentset/profile.yaml`, and it holds no code. The rules are in
[the profile contract](../spec/profile-contract.md); this page is the short way in.

Without the file, the reference profile applies (TypeScript with AWS Amplify Gen 2), as it always has.

## Start from one Intentset ships

Extend a shipped profile and state only what differs. For a TypeScript codebase that is not on Amplify:

```yaml
id: acme/web/1
extends: intentset/typescript/0.3
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

## What to know before you change it

- **A key you state replaces the shipped one whole.** Nothing is merged. That is why the example states the matrix,
  the roles, the folders and the package policy again: each named the shipped profile's layers.
- **Roles, not names, carry meaning.** Call your layers what your team calls them, and say which is the seam, which
  are pure and which render.
- **`.intentset/architecture.yaml` still works** and overrides the profile. Keep what is true of one repository
  there, such as its scope.
- **A mistake in the file fails the check** with CFG001, and the file is not applied in part.
- **The check reads TypeScript and JavaScript.** A profile for another language is refused until a release reads it.

Run `intentset architecture check` after each change. It reports what it could not check as well as what it found.
