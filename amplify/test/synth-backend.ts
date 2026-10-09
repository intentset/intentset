import process from "node:process";

// Synthesizes the backend into CDK_OUTDIR, the way `ampx` does before a deploy, and deploys nothing. Run by
// synth.test.ts in a process of its own, with the backend's identity in CDK_CONTEXT_JSON (coral-reef-site's pattern).
await import("../backend.ts");

// Amplify's default stack synthesizes when the toolkit sends this message (@aws-amplify/backend, default_stack_factory).
process.emit("message", "amplifySynth", undefined);
