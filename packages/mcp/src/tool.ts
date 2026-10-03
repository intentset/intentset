/**
 * The shape every tool has here: a definition the client lists, with a JSON
 * Schema input, and a handler over plain arguments. Arguments are checked by
 * hand against the same schema rather than through zod, which is the SDK's
 * own dependency and not one this package declares. A malformed argument,
 * including one the schema does not name, is refused rather than ignored, so
 * no argument can quietly change what a tool does.
 */
import { compareStrings } from "@intentset/core";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";

export interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, object>;
    required: string[];
    additionalProperties: false;
  };
  annotations: { readOnlyHint: true; destructiveHint: false; idempotentHint: true; openWorldHint: false };
}

export interface Tool {
  definition: ToolDefinition;
  call(args: Record<string, unknown>): ToolResult;
}

export const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

/** A result as one text block holding JSON, members in the order the object was built. */
export function result(value: unknown, isError = false): ToolResult {
  const out: ToolResult = { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
  if (isError) out.isError = true;
  return out;
}

/** Refuse arguments the tool's schema does not allow. */
export function checkArguments(definition: ToolDefinition, args: unknown): Record<string, unknown> {
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    throw new McpError(ErrorCode.InvalidParams, `${definition.name}: arguments must be an object`);
  }
  const record = args as Record<string, unknown>;
  for (const key of Object.keys(record).sort(compareStrings)) {
    if (!(key in definition.inputSchema.properties)) {
      throw new McpError(ErrorCode.InvalidParams, `${definition.name}: unknown argument ${JSON.stringify(key)}`);
    }
  }
  for (const key of definition.inputSchema.required) {
    if (record[key] === undefined) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `${definition.name}: missing required argument ${JSON.stringify(key)}`,
      );
    }
  }
  return record;
}

/** A required non-empty string argument. */
export function stringArgument(tool: string, args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new McpError(ErrorCode.InvalidParams, `${tool}: ${key} must be a non-empty string`);
  }
  return value;
}
