/**
 * Line arithmetic between a knowledge body and the file it came from, so a
 * publication diagnostic about the body can point at the line an author
 * edits. When the offset cannot be established the location is left out,
 * never guessed (ADR 0004).
 */
import { type Artifact, type Location, collectHeadings } from "@intentset/core";

/**
 * The number to add to a 1-based body line to get its file line, found by
 * matching the body's first heading with the carrier's first heading. Null
 * when the document has no heading or the two disagree.
 */
export function bodyLineOffset(artifact: Artifact): number | null {
  const fromFile = artifact.headings[0];
  const fromBody = collectHeadings(artifact.body.split("\n"), 0)[0];
  if (fromFile === undefined || fromBody === undefined || fromFile.text !== fromBody.text) return null;
  return fromFile.line - fromBody.line;
}

/** A file location for a 1-based body line, or undefined when the offset is unknown. */
export function fileLocation(offset: number | null, bodyLine: number | undefined): Location | undefined {
  if (offset === null || bodyLine === undefined) return undefined;
  return { line: bodyLine + offset };
}

/** The 1-based line of a character index in a text. */
export function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}
