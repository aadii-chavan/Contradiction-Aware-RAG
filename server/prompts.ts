import type { RetrievedChunk } from '../src/types';

export function formatContext(chunks: RetrievedChunk[]): string {
  return chunks.map((c) => `[${c.id}] (${c.date}) ${c.title}\n${c.text}`).join('\n\n');
}

export const BASELINE_SYSTEM = `You answer questions about a research lab's internal notes using only the provided context.
Answer concisely and cite the document IDs you rely on in square brackets, e.g. [DOC-04].`;

export const AWARE_SYSTEM = `You answer questions about a research lab's internal notes using only the provided context.
Before answering, check whether any two documents give incompatible information about the same thing.
- "direct": same parameter or fact, incompatible values.
- "temporal": a newer document revises or replaces an older one (compare the dates).
Only report a conflict if the documents genuinely disagree on what the question asks about. Differences in unrelated details are not conflicts.

Respond with a single JSON object and nothing else:
{
  "conflict": boolean,
  "conflict_type": "direct" | "temporal" | null,
  "conflicting": [{"id": "DOC-XX", "value": "<shortest exact span that carries the disagreeing value>"}, {"id": "DOC-YY", "value": "<exact text span>"}],
  "answer": "<2-4 sentence answer>"
}
Rules:
- "conflicting" holds the two disagreeing documents (empty array if no conflict). Each "value" must be copied verbatim from that document and be as short as possible: just the conflicting number or term (e.g. "3e-4", "BatchNorm"), never a whole sentence.
- If there is a conflict, the answer must state that the sources disagree, give each value with its document ID, and note any evidence about which is more reliable (newer date, more specific scope). Do not silently pick one.
- If there is no conflict, answer directly and cite document IDs in square brackets.`;

export const userPrompt = (query: string, chunks: RetrievedChunk[]) =>
  `Context:\n${formatContext(chunks)}\n\nQuestion: ${query}`;
