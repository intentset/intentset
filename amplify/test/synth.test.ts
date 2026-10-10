import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { invokedModels, limits, model, retentionDays } from "../functions/ask/limits.ts";
import { ALARM_EMAIL, LOCAL_ORIGIN, SITE_ORIGIN } from "../settings.ts";

type Resource = { Type: string; Properties?: Record<string, unknown>; DeletionPolicy?: string };
type Kind = "sandbox" | "branch";

const root = fileURLToPath(new URL("../..", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "intentset-synth-"));

/** Synthesize the backend as a sandbox or as the branch, reading no account. */
async function synth(kind: Kind): Promise<void> {
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("AWS_")));
  await promisify(execFile)(process.execPath, [join(root, "amplify/test/synth-backend.ts")], {
    cwd: root,
    env: {
      ...inherited,
      CDK_OUTDIR: join(dir, kind),
      CDK_CONTEXT_JSON: JSON.stringify({
        "amplify-backend-namespace": "intentset",
        "amplify-backend-name": kind === "branch" ? "main" : "synth",
        "amplify-backend-type": kind,
      }),
      AWS_REGION: "us-east-2",
      CDK_DEFAULT_REGION: "us-east-2",
      CDK_DEFAULT_ACCOUNT: "111111111111",
    },
    maxBuffer: 64 * 1024 * 1024,
    timeout: 300_000,
  });
}

function resources(kind: Kind): Resource[] {
  return readdirSync(join(dir, kind))
    .filter((file) => file.endsWith(".template.json"))
    .flatMap(
      (file) => Object.values(JSON.parse(readFileSync(join(dir, kind, file), "utf8")).Resources ?? {}) as Resource[],
    );
}
const ofType = (kind: Kind, type: string) => resources(kind).filter((r) => r.Type === type);

before(async () => {
  // The function bundles the corpus; build it when a checkout has not.
  if (!existsSync(join(root, "amplify/functions/ask/corpus.json"))) {
    await promisify(execFile)(process.execPath, ["--conditions=intentset-source", join(root, "site/corpus.ts")], {
      cwd: root,
    });
  }
  await Promise.all([synth("sandbox"), synth("branch")]);
});
after(() => rmSync(dir, { recursive: true, force: true }));

test("the function has reserved concurrency, Node 24, and no URL of its own", () => {
  for (const kind of ["sandbox", "branch"] as const) {
    const fns = ofType(kind, "AWS::Lambda::Function").filter((r) =>
      JSON.stringify(r.Properties).includes("intentset-ask"),
    );
    assert.equal(fns.length, 1, kind);
    assert.equal(fns[0].Properties?.ReservedConcurrentExecutions, limits.concurrency, kind);
    assert.equal(fns[0].Properties?.Runtime, "nodejs24.x", kind);
    assert.equal(ofType(kind, "AWS::Lambda::Url").length, 0, kind);
  }
});

test("POST /ask streams, with CORS for the site and the local server on the branch, the local server only in a sandbox", () => {
  for (const [kind, origin] of [
    ["branch", SITE_ORIGIN],
    ["branch", LOCAL_ORIGIN],
    ["sandbox", LOCAL_ORIGIN],
  ] as const) {
    const methods = ofType(kind, "AWS::ApiGateway::Method");
    const post = methods.find((m) => m.Properties?.HttpMethod === "POST");
    const integration = post?.Properties?.Integration as Record<string, unknown>;
    assert.equal(integration.ResponseTransferMode, "STREAM", kind);
    assert.equal(integration.TimeoutInMillis, limits.timeoutSeconds * 1000, kind);
    const options = methods.find((m) => m.Properties?.HttpMethod === "OPTIONS");
    assert.ok(JSON.stringify(options).includes(origin), `${kind}: preflight names ${origin}`);
    if (kind === "sandbox")
      assert.ok(!JSON.stringify(options).includes(SITE_ORIGIN), "a sandbox never answers the site");
  }
});

test("a regional firewall with a rate rule per IP is attached to the API's stage", () => {
  for (const kind of ["sandbox", "branch"] as const) {
    const [acl] = ofType(kind, "AWS::WAFv2::WebACL");
    assert.equal(acl.Properties?.Scope, "REGIONAL");
    const rules = acl.Properties?.Rules as Array<{
      Statement: { RateBasedStatement?: { Limit: number; AggregateKeyType: string } };
    }>;
    assert.deepEqual(
      rules.map((r) => [r.Statement.RateBasedStatement?.Limit, r.Statement.RateBasedStatement?.AggregateKeyType]),
      [[limits.wafPerFiveMinutes, "IP"]],
    );
    assert.equal(ofType(kind, "AWS::WAFv2::WebACLAssociation").length, 1);
  }
});

test("both tables expire their items, and the branch keeps them if the stack goes", () => {
  for (const kind of ["sandbox", "branch"] as const) {
    const tables = ofType(kind, "AWS::DynamoDB::Table");
    assert.equal(tables.length, 2, kind);
    for (const table of tables) {
      assert.deepEqual(table.Properties?.TimeToLiveSpecification, { AttributeName: "expiresAt", Enabled: true });
      assert.equal(table.DeletionPolicy, kind === "branch" ? "Retain" : "Delete");
    }
  }
  assert.ok(retentionDays > 0);
});

test("the function may invoke only the model and its fallback, through the US profile, in the Regions it routes to", () => {
  const policies = JSON.stringify(ofType("branch", "AWS::IAM::Policy"));
  assert.equal(invokedModels[0], model.id);
  for (const id of invokedModels) {
    const bare = id.replace(/^us\./, "");
    for (const region of ["us-east-1", "us-east-2", "us-west-2"]) {
      assert.ok(policies.includes(`arn:aws:bedrock:${region}::foundation-model/${bare}`), `${bare} in ${region}`);
    }
    assert.ok(policies.includes(`:inference-profile/${id}`), id);
  }
  assert.doesNotMatch(policies, /"bedrock:\*"|foundation-model\/\*/);
});

test("alarms on errors, throttles, spend, the budget and the firewall go to a topic only the branch's inbox hears", () => {
  for (const kind of ["sandbox", "branch"] as const) {
    const alarms = ofType(kind, "AWS::CloudWatch::Alarm");
    const names = alarms.map((a) => String(a.Properties?.AlarmName)).sort();
    assert.equal(names.length, 5, kind);
    for (const id of ["errors", "throttles", "spend", "budget-refused", "waf-blocked"]) {
      assert.ok(
        names.some((name) => name.includes(`intentset-ask-${id}`)),
        `${kind}: ${id}`,
      );
    }
    const spend = alarms.find((a) => String(a.Properties?.AlarmName).includes("spend"));
    assert.equal(spend?.Properties?.Threshold, limits.dailyBudgetUsd * 1_000_000 * 0.8);
    assert.ok(
      alarms.every((a) => ((a.Properties?.AlarmActions as unknown[] | undefined) ?? []).length === 1),
      kind,
    );
    const subscriptions = ofType(kind, "AWS::SNS::Subscription");
    assert.deepEqual(
      subscriptions.map((sub) => [sub.Properties?.Protocol, sub.Properties?.Endpoint]),
      kind === "branch" ? [["email", ALARM_EMAIL]] : [],
    );
  }
});
