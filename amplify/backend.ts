import { defineBackend } from "@aws-amplify/backend";
import { Aws, CfnOutput, Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import {
  EndpointType,
  LambdaIntegration,
  MethodLoggingLevel,
  ResponseTransferMode,
  RestApi,
} from "aws-cdk-lib/aws-apigateway";
import { Alarm, ComparisonOperator, Metric, TreatMissingData } from "aws-cdk-lib/aws-cloudwatch";
import { SnsAction } from "aws-cdk-lib/aws-cloudwatch-actions";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import type { CfnFunction } from "aws-cdk-lib/aws-lambda";
import { Topic } from "aws-cdk-lib/aws-sns";
import { EmailSubscription } from "aws-cdk-lib/aws-sns-subscriptions";
import { CfnWebACL, CfnWebACLAssociation } from "aws-cdk-lib/aws-wafv2";
import { limits, model } from "./functions/ask/limits.ts";
import { METRIC_NAMESPACE } from "./functions/ask/log.ts";
import { ask } from "./functions/ask/resource.ts";
import { ALARM_EMAIL, allowedOrigins } from "./settings.ts";

/**
 * The chat's backend (SLICE-ASK), all in us-east-2 in the coral-reef project: the function, two tables, an API
 * Gateway REST API that streams the answer, and a regional web application firewall in front of it. The function has
 * no URL of its own, so nothing reaches it except through the firewall.
 */
const backend = defineBackend({ ask });

const stack = Stack.of(backend.ask.resources.lambda);
const branch = backend.stack.node.tryGetContext("amplify-backend-type") === "branch";
const sandboxName = String(backend.stack.node.tryGetContext("amplify-backend-name") ?? "sandbox")
  .toLowerCase()
  .replace(/[^a-z0-9-]/g, "-")
  .slice(0, 40);
const named = (name: string) => (branch ? name : `${name}-sandbox-${sandboxName}`);
const removal = branch ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;

// The limits table: the switch, the day's spend, the day's salt and each visitor's count, all but the switch expiring.
const limitsTable = new Table(stack, "AskLimits", {
  tableName: named("intentset-ask-limits"),
  partitionKey: { name: "key", type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  timeToLiveAttribute: "expiresAt",
  removalPolicy: removal,
});
// The questions table: each question and its answer, scrubbed, deleted by TTL after retentionDays (RULE-ASK-RETENTION).
const questionsTable = new Table(stack, "AskQuestions", {
  tableName: named("intentset-ask-questions"),
  partitionKey: { name: "id", type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  timeToLiveAttribute: "expiresAt",
  removalPolicy: removal,
});

const fn = backend.ask.resources.lambda;
limitsTable.grantReadWriteData(fn);
questionsTable.grantWriteData(fn);
backend.ask.addEnvironment("ASK_LIMITS_TABLE", limitsTable.tableName);
backend.ask.addEnvironment("ASK_QUESTIONS_TABLE", questionsTable.tableName);
backend.ask.addEnvironment("ASK_ALLOWED_ORIGINS", allowedOrigins(branch).join(","));

// Bedrock: the US inference profiles of the model and its refusal fallback, and the foundation models in each Region
// those profiles route to. The organization's SCP opens us-west-2 to Bedrock only through an inference profile.
const routed = ["us-east-1", "us-east-2", "us-west-2"];
fn.addToRolePolicy(
  new PolicyStatement({
    actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
    resources: [model.id, model.fallbackId].flatMap((id) => [
      `arn:aws:bedrock:${Aws.REGION}:${Aws.ACCOUNT_ID}:inference-profile/${id}`,
      ...routed.map((region) => `arn:aws:bedrock:${region}::foundation-model/${id.replace(/^us\./, "")}`),
    ]),
  }),
);

// Reserved concurrency: the chat's ceiling, and capacity no other function in the project can take from it.
(fn.node.defaultChild as CfnFunction).reservedConcurrentExecutions = limits.concurrency;

// The API: POST /ask, streamed, CORS for the allowed origins only, and throttled at the stage as well as the firewall.
const api = new RestApi(stack, "AskApi", {
  restApiName: named("intentset-ask"),
  endpointConfiguration: { types: [EndpointType.REGIONAL] },
  // No account-wide CloudWatch role for API Gateway: it is one setting per Region, shared by every API in the project,
  // and the stage logs nothing anyway.
  cloudWatchRole: false,
  defaultCorsPreflightOptions: {
    allowOrigins: allowedOrigins(branch),
    allowMethods: ["POST", "OPTIONS"],
    allowHeaders: ["content-type"],
    maxAge: Duration.hours(1),
  },
  deployOptions: {
    stageName: "v1",
    throttlingRateLimit: 5,
    throttlingBurstLimit: 10,
    loggingLevel: MethodLoggingLevel.OFF,
    metricsEnabled: true,
  },
});
api.root.addResource("ask").addMethod(
  "POST",
  new LambdaIntegration(fn, {
    responseTransferMode: ResponseTransferMode.STREAM,
    timeout: Duration.seconds(limits.timeoutSeconds),
    allowTestInvoke: false,
  }),
);

// The firewall: requests per IP per five minutes, regional, on the API's stage.
const webAclName = named("intentset-ask");
const visibility = (metricName: string) => ({
  cloudWatchMetricsEnabled: true,
  metricName,
  sampledRequestsEnabled: false,
});
const webAcl = new CfnWebACL(stack, "AskWebAcl", {
  name: webAclName,
  scope: "REGIONAL",
  defaultAction: { allow: {} },
  visibilityConfig: visibility(webAclName),
  rules: [
    {
      name: "ask-per-ip",
      priority: 0,
      action: { block: {} },
      statement: {
        rateBasedStatement: { limit: limits.wafPerFiveMinutes, evaluationWindowSec: 300, aggregateKeyType: "IP" },
      },
      visibilityConfig: visibility("ask-per-ip"),
    },
  ],
});
new CfnWebACLAssociation(stack, "AskWebAclAssociation", {
  resourceArn: api.deploymentStage.stageArn,
  webAclArn: webAcl.attrArn,
});

// Alarms, to an inbox on the branch (a sandbox's topic has no subscriber): an error or a throttle on the function, the
// day's estimated spend past 80% of its budget, the chat refusing for the budget, and the firewall blocking a flood.
const notices = new Topic(stack, "AskNotices", { topicName: named("intentset-ask-notices") });
if (branch) notices.addSubscription(new EmailSubscription(ALARM_EMAIL));
const fiveMinutes = Duration.minutes(5);
const alarm = (id: string, metric: Metric, threshold: number) =>
  new Alarm(stack, id, {
    alarmName: named(`intentset-ask-${id}`),
    metric,
    threshold,
    evaluationPeriods: 1,
    comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    treatMissingData: TreatMissingData.NOT_BREACHING,
  }).addAlarmAction(new SnsAction(notices));
alarm("errors", fn.metricErrors({ period: fiveMinutes, statistic: "Sum" }), 1);
alarm("throttles", fn.metricThrottles({ period: fiveMinutes, statistic: "Sum" }), 1);
alarm(
  "spend",
  new Metric({ namespace: METRIC_NAMESPACE, metricName: "CostMicros", statistic: "Sum", period: Duration.days(1) }),
  limits.dailyBudgetUsd * 1_000_000 * 0.8,
);
alarm(
  "budget-refused",
  new Metric({ namespace: METRIC_NAMESPACE, metricName: "BudgetRefused", statistic: "Sum", period: fiveMinutes }),
  1,
);
alarm(
  "waf-blocked",
  new Metric({
    namespace: "AWS/WAFV2",
    metricName: "BlockedRequests",
    dimensionsMap: { WebACL: webAclName, Region: Aws.REGION, Rule: "ALL" },
    statistic: "Sum",
    period: fiveMinutes,
  }),
  50,
);

new CfnOutput(stack, "AskUrl", { value: `${api.url}ask` });
backend.addOutput({ custom: { askUrl: `${api.url}ask` } });
