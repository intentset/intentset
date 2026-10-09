import { ConditionalCheckFailedException, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

/** One stored question and its answer (BEH-ASK-KEEP-QUESTION), scrubbed, deleted by DynamoDB at `expiresAt`. */
export interface QuestionRecord {
  id: string;
  askedAt: string;
  conversationId: string;
  /** 1 for a conversation's first question. */
  turn: number;
  question: string;
  answer: string;
  outcome: Outcome;
  /** The addresses the answer cited. */
  sources: string[];
  /** The answer sent the visitor to the get-involved page. */
  contact: boolean;
  model: string;
  corpusHash: string;
  corpusVersion: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costMicros: number;
  /** Epoch seconds. */
  expiresAt: number;
}

/** answered: cited the documentation. uncited: answered without citing it, which is how gaps show. */
export type Outcome = "answered" | "uncited" | "contact" | "refused-by-model" | "failed";

/**
 * Where the chat keeps its counters, its switch and its questions. The conditions are part of the contract, so the
 * in-memory store the tests use (amplify/test/memory-store.ts) applies the same ones DynamoDB is sent.
 */
export interface Store {
  /** Read one item of the limits table. */
  get(key: string): Promise<Record<string, unknown> | null>;
  /** Store `item` under `key` unless something is there already; return what is stored. */
  putIfAbsent(key: string, item: Record<string, unknown>): Promise<Record<string, unknown>>;
  /** Add `by` to the counter at `key`, refusing when the result would pass `max`. */
  increment(key: string, by: number, max: number | null, expiresAt: number): Promise<{ ok: boolean; value: number }>;
  putQuestion(record: QuestionRecord): Promise<void>;
}

export class DynamoStore implements Store {
  readonly #client: DynamoDBDocumentClient;
  readonly #limitsTable: string;
  readonly #questionsTable: string;

  constructor(limitsTable: string, questionsTable: string, client = new DynamoDBClient({})) {
    this.#client = DynamoDBDocumentClient.from(client);
    this.#limitsTable = limitsTable;
    this.#questionsTable = questionsTable;
  }

  async get(key: string): Promise<Record<string, unknown> | null> {
    const out = await this.#client.send(
      new GetCommand({ TableName: this.#limitsTable, Key: { key }, ConsistentRead: true }),
    );
    return out.Item ?? null;
  }

  async putIfAbsent(key: string, item: Record<string, unknown>): Promise<Record<string, unknown>> {
    try {
      await this.#client.send(
        new PutCommand({
          TableName: this.#limitsTable,
          Item: { ...item, key },
          ConditionExpression: "attribute_not_exists(#k)",
          ExpressionAttributeNames: { "#k": "key" },
        }),
      );
      return { ...item, key };
    } catch (error) {
      if (!(error instanceof ConditionalCheckFailedException)) throw error;
      return (await this.get(key)) ?? { ...item, key };
    }
  }

  async increment(
    key: string,
    by: number,
    max: number | null,
    expiresAt: number,
  ): Promise<{ ok: boolean; value: number }> {
    try {
      const out = await this.#client.send(
        new UpdateCommand({
          TableName: this.#limitsTable,
          Key: { key },
          UpdateExpression: "ADD #v :by SET #e = if_not_exists(#e, :e)",
          ...(max === null ? {} : { ConditionExpression: "attribute_not_exists(#v) OR #v <= :ceiling" }),
          ExpressionAttributeNames: { "#v": "value", "#e": "expiresAt" },
          ExpressionAttributeValues: { ":by": by, ":e": expiresAt, ...(max === null ? {} : { ":ceiling": max - by }) },
          ReturnValues: "UPDATED_NEW",
        }),
      );
      return { ok: true, value: Number(out.Attributes?.value ?? by) };
    } catch (error) {
      if (!(error instanceof ConditionalCheckFailedException)) throw error;
      return { ok: false, value: max ?? 0 };
    }
  }

  async putQuestion(record: QuestionRecord): Promise<void> {
    await this.#client.send(new PutCommand({ TableName: this.#questionsTable, Item: { ...record } }));
  }
}
