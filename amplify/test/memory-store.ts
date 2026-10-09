import type { QuestionRecord, Store } from "../functions/ask/store.ts";

/** The Store with DynamoDB's conditions applied in memory, so the tests exercise the same rules the tables are sent. */
export class MemoryStore implements Store {
  readonly items = new Map<string, Record<string, unknown>>();
  readonly questions: QuestionRecord[] = [];
  failQuestions = false;

  async get(key: string): Promise<Record<string, unknown> | null> {
    return this.items.get(key) ?? null;
  }

  async putIfAbsent(key: string, item: Record<string, unknown>): Promise<Record<string, unknown>> {
    const existing = this.items.get(key);
    if (existing) return existing;
    const stored = { ...item, key };
    this.items.set(key, stored);
    return stored;
  }

  async increment(
    key: string,
    by: number,
    max: number | null,
    expiresAt: number,
  ): Promise<{ ok: boolean; value: number }> {
    const item = this.items.get(key);
    const current = Number(item?.value ?? 0);
    if (max !== null && item?.value !== undefined && current > max - by) return { ok: false, value: max };
    const value = current + by;
    this.items.set(key, { key, value, expiresAt: item?.expiresAt ?? expiresAt });
    return { ok: true, value };
  }

  async putQuestion(record: QuestionRecord): Promise<void> {
    if (this.failQuestions) throw new Error("store failed");
    this.questions.push(record);
  }
}
