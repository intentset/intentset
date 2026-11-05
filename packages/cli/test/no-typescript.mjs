// A stand-in for a repository whose package manager gave @intentset/architecture a TypeScript earlier than 7, or
// none: every resolution of `typescript` fails as it does there, for `require` and `import` alike. Loaded with
// `node --import` ahead of the CLI by the test that runs the toolchain without TypeScript.
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "typescript" || specifier.startsWith("typescript/")) {
      const error = new Error(`Cannot find package 'typescript' imported from ${context.parentURL ?? "the test"}`);
      error.code = "ERR_MODULE_NOT_FOUND";
      throw error;
    }
    return next(specifier, context);
  },
});
