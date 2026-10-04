/**
 * Every module reference in one TypeScript or JavaScript file (profile TS004:
 * type-only imports, dynamic imports and re-exports all count).
 *
 * TypeScript 7 ships its parser inside the native compiler and exposes no
 * in-process `createSourceFile`; what it does ship in JavaScript is the
 * scanner. So this module tokenizes with TypeScript's own scanner, which is
 * what gets strings, comments, template literals and regular expressions
 * right, and recognizes the handful of declaration shapes that carry a module
 * specifier over the token stream:
 *
 *   import d, { a, type B } from "x"     import type { A } from "x"
 *   import "x"                           import X = require("x")
 *   export { a } from "x"                export type { A } from "x"
 *   export * from "x"                    export * as ns from "x"
 *   import("x")                          require("x")
 *
 * The scanner leaves two decisions to its parser: whether `/` starts a
 * regular expression, and whether `}` resumes a template literal. Both are
 * made here from the preceding token and a stack of template brace depths.
 * Anything this module cannot read is returned as a problem, never dropped:
 * a dynamic import with a computed specifier, or a token the scanner could
 * not terminate (invariant 6).
 */
import { LanguageVariant, SyntaxKind } from "typescript/unstable/ast";
import { computeLineStarts, createScanner, tokenIsIdentifierOrKeyword } from "typescript/unstable/ast/scanner";

export interface RawImport {
  specifier: string;
  /** 1-based line of the specifier. */
  line: number;
  /** `import type`, `export type`, every named specifier marked `type`, or `typeof import("x")`. */
  typeOnly: boolean;
  /** `import("x")` or `require("x")`. */
  dynamic: boolean;
  /** `export ... from "x"`. */
  reexport: boolean;
  /** `export * from "x"` or `export * as ns from "x"`. */
  wildcard: boolean;
}

export interface ExtractProblem {
  line: number;
  message: string;
}

export interface Extraction {
  imports: RawImport[];
  problems: ExtractProblem[];
}

interface Token {
  kind: SyntaxKind;
  text: string;
  value: string;
  line: number;
}

/** Keywords after which `/` begins a regular expression rather than a division. */
const REGEX_AFTER_WORD = new Set([
  "return",
  "typeof",
  "case",
  "in",
  "of",
  "delete",
  "void",
  "throw",
  "new",
  "else",
  "do",
  "instanceof",
  "yield",
  "await",
]);

const VALUE_ENDING = new Set<SyntaxKind>([
  SyntaxKind.NumericLiteral,
  SyntaxKind.BigIntLiteral,
  SyntaxKind.StringLiteral,
  SyntaxKind.RegularExpressionLiteral,
  SyntaxKind.NoSubstitutionTemplateLiteral,
  SyntaxKind.TemplateTail,
  SyntaxKind.CloseParenToken,
  SyntaxKind.CloseBracketToken,
  SyntaxKind.CloseBraceToken,
  SyntaxKind.PlusPlusToken,
  SyntaxKind.MinusMinusToken,
]);

function regexAllowed(previous: Token | undefined): boolean {
  if (previous === undefined) return true;
  if (VALUE_ENDING.has(previous.kind)) return false;
  if (tokenIsIdentifierOrKeyword(previous.kind)) return REGEX_AFTER_WORD.has(previous.text);
  return true;
}

function isJsx(path: string): boolean {
  return path.endsWith(".tsx") || path.endsWith(".jsx");
}

function tokenize(path: string, text: string): { tokens: Token[]; problems: ExtractProblem[] } {
  const jsx = isJsx(path);
  const scanner = createScanner(true, jsx ? LanguageVariant.JSX : LanguageVariant.Standard, text);
  const starts = computeLineStarts(text);
  const lineOf = (position: number): number => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (starts[mid] <= position) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  };
  const tokens: Token[] = [];
  const problems: ExtractProblem[] = [];
  /** Open brace depth inside each `${` of an unfinished template literal. */
  const templates: number[] = [];
  let previous: Token | undefined;
  let lastEnd = -1;
  for (;;) {
    let kind = scanner.scan();
    if (kind === SyntaxKind.EndOfFile) break;
    // TypeScript 7's scanner can return a token without advancing: JSX text
    // such as `#{n}` scans as an empty private identifier at the `#`, forever.
    // A token that ends where the last one did makes no progress, so step over
    // one character. In JSX that costs nothing, since no import is written in
    // JSX text; anywhere else it is reported, because something was skipped.
    if (scanner.getTokenEnd() <= lastEnd) {
      if (!jsx) {
        problems.push({
          line: lineOf(lastEnd),
          message: "the scanner could not advance here, so one character was skipped",
        });
      }
      lastEnd++;
      scanner.resetTokenState(lastEnd);
      continue;
    }
    lastEnd = scanner.getTokenEnd();
    if ((kind === SyntaxKind.SlashToken || kind === SyntaxKind.SlashEqualsToken) && regexAllowed(previous)) {
      kind = scanner.reScanSlashToken();
    } else if (kind === SyntaxKind.OpenBraceToken && templates.length > 0) {
      templates[templates.length - 1]++;
    } else if (kind === SyntaxKind.CloseBraceToken && templates.length > 0) {
      if (templates[templates.length - 1] === 0) {
        kind = scanner.reScanTemplateToken(false);
        if (kind === SyntaxKind.TemplateTail) templates.pop();
      } else templates[templates.length - 1]--;
    }
    if (kind === SyntaxKind.TemplateHead) templates.push(0);
    const line = lineOf(scanner.getTokenStart());
    if (scanner.isUnterminated()) {
      // In JSX, text such as `Don't` scans as a string that runs to the end of its line and no further;
      // it costs at most that line, and no import is written inside JSX text.
      if (!(jsx && kind === SyntaxKind.StringLiteral)) {
        problems.push({ line, message: `the scanner could not terminate a ${describe(kind)} that starts here` });
      }
    }
    const token: Token = { kind, text: scanner.getTokenText(), value: scanner.getTokenValue(), line };
    tokens.push(token);
    previous = token;
  }
  if (templates.length > 0) {
    problems.push({ line: previous?.line ?? 1, message: "a template literal is still open at the end of the file" });
  }
  return { tokens, problems };
}

function describe(kind: SyntaxKind): string {
  switch (kind) {
    case SyntaxKind.StringLiteral:
      return "string literal";
    case SyntaxKind.RegularExpressionLiteral:
      return "regular expression";
    case SyntaxKind.NoSubstitutionTemplateLiteral:
    case SyntaxKind.TemplateHead:
    case SyntaxKind.TemplateMiddle:
    case SyntaxKind.TemplateTail:
      return "template literal";
    default:
      return "token";
  }
}

/** Extract every module reference from one file. */
export function extractImports(path: string, text: string): Extraction {
  const { tokens, problems } = tokenize(path, text);
  const imports: RawImport[] = [];
  const consumed = new Set<number>();

  const word = (i: number, text?: string): boolean => {
    const token = tokens[i];
    return token !== undefined && tokenIsIdentifierOrKeyword(token.kind) && (text === undefined || token.text === text);
  };
  const is = (i: number, kind: SyntaxKind): boolean => tokens[i]?.kind === kind;
  const isString = (i: number): boolean => is(i, SyntaxKind.StringLiteral);
  const isLiteral = (i: number): boolean => isString(i) || is(i, SyntaxKind.NoSubstitutionTemplateLiteral);
  const afterDot = (i: number): boolean => is(i - 1, SyntaxKind.DotToken) || is(i - 1, SyntaxKind.QuestionDotToken);
  const add = (i: number, fields: Omit<RawImport, "specifier" | "line">) => {
    imports.push({ specifier: tokens[i].value, line: tokens[i].line, ...fields });
  };
  /** Index of the token closing the bracket opened at i, or tokens.length. */
  const closing = (i: number, open: SyntaxKind, close: SyntaxKind): number => {
    let depth = 0;
    for (let k = i; k < tokens.length; k++) {
      if (tokens[k].kind === open) depth++;
      else if (tokens[k].kind === close && --depth === 0) return k;
    }
    return tokens.length;
  };
  /** Named elements between braces: true when every one is written `type X`. */
  const allTyped = (open: number, close: number): boolean => {
    let count = 0;
    let typed = 0;
    let start = true;
    for (let k = open + 1; k < close; k++) {
      if (is(k, SyntaxKind.CommaToken)) {
        start = true;
        continue;
      }
      if (start) {
        count++;
        if (word(k, "type") && word(k + 1) && !word(k + 1, "as")) typed++;
        start = false;
      }
    }
    return count > 0 && typed === count;
  };
  /** A call such as `import(x)` or `require(x)` that is really a method declaration `import(x) { ... }`. */
  const isMethod = (open: number): boolean =>
    is(closing(open, SyntaxKind.OpenParenToken, SyntaxKind.CloseParenToken) + 1, SyntaxKind.OpenBraceToken);

  for (let i = 0; i < tokens.length; i++) {
    if (consumed.has(i) || afterDot(i)) continue;

    if (word(i, "import") && tokens[i].kind === SyntaxKind.ImportKeyword) {
      if (is(i + 1, SyntaxKind.OpenParenToken)) {
        if (isLiteral(i + 2) && (is(i + 3, SyntaxKind.CloseParenToken) || is(i + 3, SyntaxKind.CommaToken))) {
          add(i + 2, { typeOnly: word(i - 1, "typeof"), dynamic: true, reexport: false, wildcard: false });
        } else if (!is(i + 2, SyntaxKind.CloseParenToken) && !isMethod(i + 1)) {
          problems.push({
            line: tokens[i].line,
            message: "a dynamic import has a computed specifier, so its target cannot be known",
          });
        }
        continue;
      }
      if (
        is(i + 1, SyntaxKind.DotToken) ||
        is(i + 1, SyntaxKind.ColonToken) ||
        is(i + 1, SyntaxKind.CommaToken) ||
        is(i + 1, SyntaxKind.CloseBraceToken) ||
        is(i + 1, SyntaxKind.CloseParenToken)
      ) {
        continue;
      }
      let j = i + 1;
      let typeOnly = false;
      if (
        word(j, "type") &&
        !is(j + 1, SyntaxKind.CommaToken) &&
        !is(j + 1, SyntaxKind.EqualsToken) &&
        !(word(j + 1, "from") && isString(j + 2))
      ) {
        typeOnly = true;
        j++;
      }
      if (isString(j)) {
        add(j, { typeOnly, dynamic: false, reexport: false, wildcard: false });
        continue;
      }
      if (word(j) && is(j + 1, SyntaxKind.EqualsToken)) {
        if (word(j + 2, "require") && is(j + 3, SyntaxKind.OpenParenToken) && isString(j + 4)) {
          add(j + 4, { typeOnly, dynamic: false, reexport: false, wildcard: false });
          consumed.add(j + 2);
        }
        continue;
      }
      // Default, namespace and named bindings, then `from "x"`.
      let hasPlainBinding = false;
      let typedNamed = false;
      for (let k = j; k < tokens.length && k < j + 4096; k++) {
        if (is(k, SyntaxKind.OpenBraceToken)) {
          const close = closing(k, SyntaxKind.OpenBraceToken, SyntaxKind.CloseBraceToken);
          typedNamed = allTyped(k, close);
          k = close;
          continue;
        }
        if (word(k, "from") && isString(k + 1)) {
          const typed = typeOnly || (typedNamed && !hasPlainBinding);
          add(k + 1, { typeOnly: typed, dynamic: false, reexport: false, wildcard: false });
          i = k + 1;
          break;
        }
        if (is(k, SyntaxKind.SemicolonToken) || word(k, "import") || word(k, "export")) break;
        if (is(k, SyntaxKind.AsteriskToken) || (word(k) && !word(k, "as") && !is(k - 1, SyntaxKind.AsKeyword))) {
          hasPlainBinding = true;
        }
      }
      continue;
    }

    if (word(i, "export") && tokens[i].kind === SyntaxKind.ExportKeyword) {
      let j = i + 1;
      let typeOnly = false;
      if (word(j, "type") && (is(j + 1, SyntaxKind.OpenBraceToken) || is(j + 1, SyntaxKind.AsteriskToken))) {
        typeOnly = true;
        j++;
      }
      if (is(j, SyntaxKind.AsteriskToken)) {
        let k = j + 1;
        if (word(k, "as")) k += 2;
        if (word(k, "from") && isString(k + 1)) {
          add(k + 1, { typeOnly, dynamic: false, reexport: true, wildcard: true });
          i = k + 1;
        }
        continue;
      }
      if (is(j, SyntaxKind.OpenBraceToken)) {
        const close = closing(j, SyntaxKind.OpenBraceToken, SyntaxKind.CloseBraceToken);
        if (word(close + 1, "from") && isString(close + 2)) {
          add(close + 2, { typeOnly: typeOnly || allTyped(j, close), dynamic: false, reexport: true, wildcard: false });
          i = close + 2;
        }
      }
      continue;
    }

    if (word(i, "require") && is(i + 1, SyntaxKind.OpenParenToken) && !word(i - 1, "function")) {
      if (isLiteral(i + 2) && is(i + 3, SyntaxKind.CloseParenToken)) {
        add(i + 2, { typeOnly: false, dynamic: true, reexport: false, wildcard: false });
      } else if (!is(i + 2, SyntaxKind.CloseParenToken) && !isMethod(i + 1)) {
        problems.push({
          line: tokens[i].line,
          message: "a require call has a computed specifier, so its target cannot be known",
        });
      }
    }
  }

  return { imports, problems };
}

/** What an Amplify schema declares at its top level (profile §9, AMP009). */
export const SCHEMA_KINDS = ["model", "enum", "query", "mutation", "subscription", "customType"] as const;
export type SchemaKind = (typeof SCHEMA_KINDS)[number];

export interface SchemaDeclaration {
  name: string;
  /** Null when the value is not a builder call this reader recognizes, such as a variable defined elsewhere. */
  kind: SchemaKind | null;
  line: number;
}

/** A relationship or reference by name inside a schema (AMP010): `belongsTo("X")`, `hasMany`, `hasOne`, `ref`. */
export interface SchemaReference {
  target: string;
  via: "belongsTo" | "hasMany" | "hasOne" | "ref";
  line: number;
}

export interface SchemaExtraction {
  /** False when the file holds no `<builder>.schema({ ... })` call at all. */
  found: boolean;
  declarations: SchemaDeclaration[];
  references: SchemaReference[];
  problems: ExtractProblem[];
}

const REFERENCE_CALLS = new Set(["belongsTo", "hasMany", "hasOne", "ref"]);
const OPENERS = new Set<SyntaxKind>([
  SyntaxKind.OpenBraceToken,
  SyntaxKind.OpenParenToken,
  SyntaxKind.OpenBracketToken,
]);
const CLOSERS = new Set<SyntaxKind>([
  SyntaxKind.CloseBraceToken,
  SyntaxKind.CloseParenToken,
  SyntaxKind.CloseBracketToken,
]);

/**
 * The top-level names an Amplify Gen 2 schema file declares, and the names its
 * relationships and references point at, read from TypeScript's tokens as
 * imports are. Every `<builder>.schema({ ... })` object literal counts: each
 * key at its top level is a declaration, its kind read from a `<builder>.<kind>(`
 * value or from a `const Name = <builder>.<kind>(` elsewhere in the file. A
 * spread, or a value that is neither, is a problem rather than a guess.
 */
export function extractSchema(path: string, text: string): SchemaExtraction {
  const { tokens, problems } = tokenize(path, text);
  const declarations: SchemaDeclaration[] = [];
  const references: SchemaReference[] = [];
  const word = (i: number, value?: string): boolean => {
    const token = tokens[i];
    return (
      token !== undefined && tokenIsIdentifierOrKeyword(token.kind) && (value === undefined || token.text === value)
    );
  };
  const is = (i: number, kind: SyntaxKind): boolean => tokens[i]?.kind === kind;
  /** `<builder>.<kind>(` starting at i, as the kind, or null. */
  const builderCall = (i: number): SchemaKind | null => {
    if (!word(i) || !is(i + 1, SyntaxKind.DotToken) || !word(i + 2) || !is(i + 3, SyntaxKind.OpenParenToken))
      return null;
    const kind = tokens[i + 2].text;
    return (SCHEMA_KINDS as readonly string[]).includes(kind) ? (kind as SchemaKind) : null;
  };
  const bound = new Map<string, SchemaKind>();
  for (let i = 0; i + 3 < tokens.length; i++) {
    if ((word(i, "const") || word(i, "let")) && word(i + 1) && is(i + 2, SyntaxKind.EqualsToken)) {
      const kind = builderCall(i + 3);
      if (kind !== null) bound.set(tokens[i + 1].text, kind);
    }
  }

  let found = false;
  for (let i = 0; i + 4 < tokens.length; i++) {
    if (!(word(i) && is(i + 1, SyntaxKind.DotToken) && word(i + 2, "schema"))) continue;
    if (!(is(i + 3, SyntaxKind.OpenParenToken) && is(i + 4, SyntaxKind.OpenBraceToken))) continue;
    found = true;
    let depth = 0;
    let k = i + 5;
    for (; k < tokens.length; k++) {
      const token = tokens[k];
      if (CLOSERS.has(token.kind)) {
        if (depth === 0) break;
        depth--;
        continue;
      }
      if (OPENERS.has(token.kind)) {
        depth++;
        continue;
      }
      if (
        word(k) &&
        REFERENCE_CALLS.has(token.text) &&
        is(k - 1, SyntaxKind.DotToken) &&
        is(k + 1, SyntaxKind.OpenParenToken)
      ) {
        if (is(k + 2, SyntaxKind.StringLiteral)) {
          references.push({ target: tokens[k + 2].value, via: token.text as SchemaReference["via"], line: token.line });
        }
        continue;
      }
      if (depth !== 0) continue;
      const startsMember = is(k - 1, SyntaxKind.OpenBraceToken) || is(k - 1, SyntaxKind.CommaToken);
      if (!startsMember) continue;
      if (is(k, SyntaxKind.DotDotDotToken)) {
        problems.push({
          line: token.line,
          message: "the schema spreads another object in, and its members were not read",
        });
        continue;
      }
      const isKey = word(k) || is(k, SyntaxKind.StringLiteral);
      if (!isKey) continue;
      const name = is(k, SyntaxKind.StringLiteral) ? token.value : token.text;
      if (is(k + 1, SyntaxKind.ColonToken)) {
        const direct = builderCall(k + 2);
        const named = word(k + 2) && !is(k + 3, SyntaxKind.DotToken) ? (bound.get(tokens[k + 2].text) ?? null) : null;
        const kind = direct ?? named;
        if (kind === null) {
          problems.push({ line: token.line, message: `the kind of the schema member ${name} could not be read` });
        }
        declarations.push({ name, kind, line: token.line });
      } else if (is(k + 1, SyntaxKind.CommaToken) || is(k + 1, SyntaxKind.CloseBraceToken)) {
        const kind = bound.get(name) ?? null;
        if (kind === null) {
          problems.push({ line: token.line, message: `the kind of the schema member ${name} could not be read` });
        }
        declarations.push({ name, kind, line: token.line });
      }
    }
    i = k;
  }
  return { found, declarations, references, problems };
}

/** 1-based lines where `name` is called, as `name(` or `name<T>(`, not as a method and not where it is declared. */
export function findCalls(path: string, text: string, name: string): number[] {
  const { tokens } = tokenize(path, text);
  const lines: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!tokenIsIdentifierOrKeyword(token.kind) || token.text !== name) continue;
    const before = tokens[i - 1];
    if (before !== undefined && (before.kind === SyntaxKind.DotToken || before.text === "function")) continue;
    const next = tokens[i + 1]?.kind;
    if (next === SyntaxKind.OpenParenToken || next === SyntaxKind.LessThanToken) lines.push(token.line);
  }
  return lines;
}
