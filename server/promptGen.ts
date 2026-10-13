import { getDocs, setPrompts } from './corpus';
import { chat, type LlmConfig } from './llm';

const SYSTEM = `You write search questions for a research lab's internal notes.
For each document, write ONE natural question a lab member might ask whose answer is stated in that document.
Be specific: name the model, dataset or parameter so a keyword search could find it. Do not mention document IDs.
Respond with a single JSON object mapping each document id to its question, e.g. {"DOC-01": "..."}.`;

/** Generates a sample question for each document that lacks one (or all, with `overwrite`). Returns how many were set. */
export async function generateQuestions(cfg: LlmConfig, overwrite = false): Promise<number> {
  const targets = getDocs().filter((d) => overwrite || !d.prompt);
  if (targets.length === 0) return 0;

  const user = targets.map((d) => `[${d.id}] ${d.title}\n${d.text}`).join('\n\n');
  const raw = await chat(cfg, SYSTEM, user, { json: true });
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Model did not return JSON.');
  const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;

  const valid = new Set(targets.map((d) => d.id));
  const questions: Record<string, string> = {};
  for (const [id, q] of Object.entries(parsed)) {
    if (valid.has(id) && typeof q === 'string' && q.trim()) questions[id] = q.trim();
  }
  setPrompts(questions);
  return Object.keys(questions).length;
}
