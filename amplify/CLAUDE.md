# The chat's backend

Loaded when an agent works under `amplify/`; the repository's rules are in the root `CLAUDE.md`. Paths are
repository-relative.


`amplify/` is the chat's backend (SLICE-ASK), Amplify Gen 2 in us-east-2 in Coral Reef's environment accounts (below),
with the same rules as coral-reef-site: every Regional resource in us-east-2, no Lambda@Edge, and us-east-1 only where a service requires it, such as a CloudFront certificate (allowed since 2026-10-12). It is a
pnpm workspace member of its own (`@intentset/chat-backend`) with its own `tsconfig.json`, so nothing it depends on
reaches a published package.

- **The shape.** One function, `intentset-ask` (`amplify/functions/ask/`), with reserved concurrency (`limits.ts`,
  the project's Lambda quota is 1000); an API Gateway REST API, `POST /ask`, streaming (`ResponseTransferMode.STREAM`),
  CORS for intentset.org and `http://localhost:3004` on the branch, so `pnpm run site:watch` can try the real backend, and the local server only in a sandbox (`settings.ts`), no CloudWatch role; a
  regional WAF with a rate rule per IP on the stage; two tables with TTL, `intentset-ask-limits` (the switch, the
  day's spend, the day's salt, each visitor's count) and `intentset-ask-questions` (scrubbed, 90 days). The function
  has no URL of its own.
- **The model.** Claude Sonnet 4.6 through `us.anthropic.claude-sonnet-4-6`, effort `low`, no fallback, until
  Anthropic approves the account's use case for Opus 5.5 on Bedrock (submitted 2026-10-09; until then Bedrock answers
  Opus 4.7 and later with "not available for this account"). The function calls Bedrock in us-east-1 (`model.region`,
  2026-10-20): us-east-2's endpoint answered prod and dev with ServiceUnavailable after the Marketplace agreement was
  renewed, while us-east-1's answered; the profile already routes inference there. Then `limits.ts` names Opus 5.5 with the SDK's
  refusal-fallback middleware to Opus 4.8, and Opus 5.5's prices; the corpus goes as cited document blocks, the last one cached for an hour,
  after a system prompt with no date in it. The profile routes to us-east-1, us-east-2 and us-west-2; the SCP
  `p-mlfzkjk2` opens us-west-2 to Bedrock only through an inference profile, and the function's grants name the two
  profiles and their foundation models in those three Regions only.
- **Limits and retention** are constants in `amplify/functions/ask/limits.ts`: question length, turns, the visitor's
  daily count, the daily budget (estimated from token counts at Anthropic's published rates), retention. A changed
  retention period changes the privacy page in the same commit.
- **Alarms** go to the SNS topic `intentset-ask-notices`, which on the branch emails hello@coralreefventures.com (as
  coral-reef-site's do; a sandbox's topic has no subscriber): function errors or throttles, the day's estimated spend
  (the `CostMicros` metric, `Intentset/Chat`) past 80% of the budget, any refusal for the budget (`BudgetRefused`),
  and the firewall blocking 50 requests in five minutes. AWS asks the inbox to confirm the subscription once.
- **The switch.** Put `{"key": "switch", "state": "off"}` in the limits table and the chat refuses every question
  until the item is removed; no deploy.
- **Logs** carry an event kind, ids, a status and token counts (`log.ts`); `amplify/test/ask.test.ts` runs the whole
  flow and fails if a question, an answer or an address reaches the console.
- **The corpus** is `amplify/functions/ask/corpus.json`, built by `pnpm run corpus` and never committed; `pnpm run
  typecheck` builds it first, and the synth test builds it when it is missing.
- **Tests**: `amplify/test/*.test.ts` run with `pnpm test`, the synth test synthesizing the backend twice, as a
  sandbox and as the branch, reading no account.
- **The eval** (`amplify/eval/`, 2026-10-10): `questions.json` is about twenty fixed questions, each with the sources
  a right answer cites (any of them) or the outcome it records, covering the concepts, the command, the
  specifications, the VSA check, the drift gate, an off-topic question, a contact request, a question the documents
  do not answer and a prompt injection. `pnpm run chat:eval` builds the corpus and runs every question through `ask()`
  and `bedrockModel()` against Bedrock with the `crv-sandbox` profile and an in-memory store (nothing is written to
  DynamoDB, nothing counts against the day's budget), prints a pass/fail table and the estimated cost (about $0.90 a
  run on Sonnet 4.6 when the prompt changed and the cache is written; about $0.50 when it is warm), and exits 1 on any
  failure. **Run it before any change to the prompt, the model or `limits.ts`'s model, and put its table and cost in
  the pull request.** Change an expectation only when the expectation was wrong, never to pass a wrong answer.
  `amplify/test/eval.test.ts` holds the file's shape, its coverage, and that every expected source is in the corpus.
- **An agent's sandbox**: `pnpm run sandbox` deploys `intentset-agent` with the `crv-sandbox` profile (the agents' account); exercise it, then
  delete it with `pnpm exec ampx sandbox delete --identifier intentset-agent --profile crv-sandbox --yes`, check that no
  `/aws/lambda/amplify-intentset*` log group, `intentset-ask-*` table or `intentset-ask-*` web ACL is left, and move
  `.amplify/artifacts` out of the way (CDK's hotswap cache remembers the deleted stacks).
- **The environments** (2026-10-14, Streamlane ADR 0087): an Amplify app with no repository connected in each of
  Coral Reef's dev, staging and prod accounts (`amplify/environments.json`), deployed by
  `.github/workflows/chat-backend.yml` with `ampx pipeline-deploy --branch main` in the GitHub environment of the same
  name, through its `AWS_ROLE_ARN` (`github-deploy-intentset`, which only that environment may assume): dev on a push
  to main that touches the backend or the corpus's sources, staging nightly from what dev last shipped, and **prod only
  when the product owner starts it by hand; an agent never does**. Each moves the tag `deployed/chat/<environment>`.
  Dev and staging set `INTENTSET_ALARM_EMAIL` empty, so their alarms reach no inbox (`settings.ts`). intentset.org's
  `ASK_URL` names prod's. The old project's app (`d20jjgxbjnk8kx` in 865000063691) served it until the move; that account was closed on
  2026-10-16.
- **The launch** was one change: `ASK_URL` in `site/build.ts` set to prod's `POST /ask`. It builds the panel and
  the privacy page (`CHAT_PAGES`, `site/content/privacy.md`, approved 2026-10-09, linked from the footer's row) into
  the site. `amplify/test/retention.test.ts` holds the page to the periods in `limits.ts` and the logs' month.

## Learning from questions

The chat keeps each question 90 days, scrubbed (CAP-LEARN-FROM-QUESTIONS). `pnpm run questions:report` reads them,
read-only, with the `crv-prod` profile (where prod keeps them) unless `AWS_PROFILE` or keys say otherwise (`amplify/questions/`,
BEH-QUESTIONS-REPORT; `--help` lists the options). The questions are visitor data and this repository is public: the
report goes to standard output, an `--out` inside the repository is warned about, and no report, brief or question is
ever committed. The checks' own conversations are left out by their id prefixes (`--exclude-prefix`); a new check
names its conversations with one of them, or adds its prefix to `defaultExcludePrefixes` in `report.ts`.

- **The measure.** The report's Measure line is MEAS-QUESTIONS-ANSWERED: `answered` over `answered` plus `uncited`,
  contact requests, refusals and failures left out. Read it monthly with `--days 30`; the first 30 days after the
  launch (2026-10-09) are the baseline, and the target is set then, in the measure record.
- **Drafting knowledge from gaps.** `pnpm run questions:report --gaps` writes a brief: the questions the
  documentation did not answer, grouped, and what to do with them. An agent given it sets aside the off-topic
  questions, looks for each answer in `spec/`, `site/content/` and `product/model/`, and either names the page that
  already answers it (a findability gap) or drafts a knowledge record under `product/model/knowledge/` (`type:
  knowledge`, `status: draft`, `links.explains`, a `## Sources` section naming what it draws on). It writes only what
  those sources say, never a fact they do not, and describes each subject in its own words, never quoting a visitor.
  Records stay drafts: a person reviews them, and publication refuses a draft. No model runs here; the agent is
  whoever runs the procedure.

<!-- BEGIN AWS Agent Toolkit rules -->
# AWS Guidance for the new AWS experience

This user has signed up for the new AWS experience. This experience lets you sign into AWS using a social provider and requires the following additional context.

Where this guidance conflicts with the project's own instructions, the project's instructions take precedence.

## Context

### Terminology:

- Say "project" instead of "account" — a project contains an AWS account and settings for sharing with other collaborators
- Say "team member" instead of "IAM user" — users are invited by email, not created or federated in IAM
- Say "AWS Settings" when referring to management tasks at [settings.aws.com](https://settings.aws.com/) (project management, billing, team members, spend limits). Users view their actual AWS resources in the AWS Management Console.
- Say "selected Region" when referring to the user's Region — not "home Region"
- The user has a managed IAM experience. This includes a managed service control policies (SCP) and resource control policies (RCP) that govern the use of AWS. They will still need to use IAM to create policies to let services work with each other. If there are questions about the SCPs or RCPs, go to the documentation at https://docs.aws.amazon.com/accounts/latest/reference/scps-and-rcps-for-projects.html

### Constraints:

- All projects share a single AWS Region determined by the user's contact address. Resources cannot be created in other Regions
- When developing:
  - MUST create all Regional resources in the project's assigned Region
  - You CAN create AWS WAF and Cloudwatch Logs resources in us-east-1 when there are global resources (like a global WAF instance) that require a connection to dependencies in us-east-1. You should not use these for any other reason, because resources in the selected Region will provide lower cost (due to no cross-Region traffic), increased availability (due to no cross-Region traffic), and easier manageability (due to not needing to look in another Region). When you need to do an inventory of resources, you need to look in both the selected Region and us-east-1 for Cloudwatch Logs or WAF resources.
  - MUST NOT attempt to create Lambda, API Gateway, or other Regional resources in any other Region
  - MUST direct users to confirm their Region in AWS Settings > View all projects > Overview > Additional Info > Region. If the user cannot confirm their Region, check in ~/.aws/config
  - MUST NOT use Lambda@Edge — excluded from both Lambda and CloudFront
  - MUST NOT use CloudFormation StackSets — no multi-account or multi-Region deployments
  - MUST NOT attempt cross-Region actions — no cross-Region replication for DynamoDB/S3/RDS, no multi-Region KMS keys
  - MUST NOT use Route 53 cross-Region routing — geolocation, latency-based, and failover routing policies are not available
  - CloudFront is a global service and its actions ARE allowed in `us-east-1`. A user can create a CloudFront distribution pointing to their project-region Lambda function URL or API Gateway. However, Lambda and API Gateway themselves MUST NOT be created in `us-east-1` — they must be in the project Region.
  - Reduced availability in `eu-north-1` specifically: Amazon Rekognition, Amazon Textract, Amazon Personalize, AWS App Runner are not available in that Region.
- IAM permissions for human access are managed by AWS. Don't assign roles to team members unless absolutely necessary
- The user may have a spend limit if they are on the paid plan. The limit that pauses their project if it's exceeded. If resources suddenly become inaccessible, ask if they have a spend limit configured. Only project owners can modify a spend limit.
- When developing:
  - MUST ask about spend limit status if the user reports sudden "Access Denied" errors on operations that previously worked
  - MUST direct users to check spend status in AWS Settings > Billing
  - MUST check if a user has upgraded their account to the paid plan
  - MUST ask the user if they want to clean up the successfully created resources or keep them to reduce cost
- The user sets up billing, creates spend limits, and retrieves and pays invoices in AWS Settings. The user creates budgets and optimizes their costs in the AWS Billing and Cost Management console
- Not all AWS services are available. If a service isn't working, do the following:
  1. Run the command `aws freetier get-account-plan-state`
  2. If accountPlanType": "FREE", check the [Free Tier supported services list](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html#supported-services-free-tier) next,
  3. If accountPlanType": "PAID", check the [Paid Tier supported services list](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html#supported-services-paid-plan).
  4. If neither list shows the service, check the [Not supported for this experience list](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html#unsupported-services). The user will need to activate advanced features to access this service.
- Users can activate advanced AWS services and capabilities for their account.
- Before starting a task, check whether a relevant AWS skill is available. Load the skill with retrieve_skill and prefer its guidance over general knowledge.

### Help level

- help_level (required): LOW, MEDIUM, or HIGH. While a user is building, you MUST ask the user: "How much guidance would you like from me? Low (I only flag security risks), medium (I ask a couple of clarifying questions if something seems off), or high (I explain what I'm doing, suggest alternatives, and flag best practices)."

You CAN update this rule file to save a user's help_level.

Constraints for each level:

**LOW:**

- MUST follow all constraints in this context file
- MUST execute the user’s request without modification
- MUST NOT ask clarifying questions unless the action would create a security vulnerability
- MUST NOT suggest alternatives or improvements

**MEDIUM:**

- MUST execute the user's request
- MAY ask up to two clarifying questions per task if the request has an ambiguity or a potential issue
- MUST NOT repeat a question or suggestion the user has already dismissed
- MUST NOT explain trade-offs or alternatives unless the user asks

**HIGH:**

- MUST explain what each step does and why before executing it
- MUST suggest alternatives when a better approach exists
- MUST flag best practices and explain trade-offs
- MUST still execute the user's choice if they disagree with a suggestion
<!-- END AWS Agent Toolkit rules -->
