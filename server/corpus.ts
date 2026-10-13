import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export interface Doc {
  id: string;
  title: string;
  date: string;
  text: string;
  /** A sample question this document answers. */
  prompt?: string;
}

export type DocInput = Pick<Doc, 'title' | 'date' | 'text' | 'prompt'>;

/** Seeded lab-notes corpus, editable from the Documents page. Several documents deliberately contradict each other. */
const FILE = resolve(process.cwd(), 'data/corpus.json');

let docs: Doc[] = existsSync(FILE) ? (JSON.parse(readFileSync(FILE, 'utf8')) as Doc[]) : [];
let version = 0;
const listeners: (() => void)[] = [];

function persist() {
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(docs, null, 2) + '\n');
  version++;
  listeners.forEach((fn) => fn());
}

/** Registers a callback fired after every corpus change (used to rebuild the retrieval index). */
export const onCorpusChange = (fn: () => void) => listeners.push(fn);

export const getDocs = (): readonly Doc[] => docs;
export const corpusVersion = () => version;

function validate(input: DocInput): DocInput {
  const title = String(input.title ?? '').trim();
  const date = String(input.date ?? '').trim();
  const text = String(input.text ?? '').trim();
  if (!title) throw new Error('Title is required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) throw new Error('Date must be a valid YYYY-MM-DD.');
  if (!text) throw new Error('Text is required.');
  const prompt = String(input.prompt ?? '').trim();
  return { title, date, text, ...(prompt ? { prompt } : {}) };
}

export function createDoc(input: DocInput): Doc {
  const next = docs.reduce((max, d) => Math.max(max, Number(/\d+$/.exec(d.id)?.[0] ?? 0)), 0) + 1;
  const doc: Doc = { id: `DOC-${String(next).padStart(2, '0')}`, ...validate(input) };
  docs = [...docs, doc];
  persist();
  return doc;
}

export function updateDoc(id: string, input: DocInput): Doc {
  const idx = docs.findIndex((d) => d.id === id);
  if (idx < 0) throw new Error(`${id} not found.`);
  const doc: Doc = { id, ...validate(input) };
  docs = docs.map((d, i) => (i === idx ? doc : d));
  persist();
  return doc;
}

export function deleteDoc(id: string): void {
  if (!docs.some((d) => d.id === id)) throw new Error(`${id} not found.`);
  docs = docs.filter((d) => d.id !== id);
  persist();
}

/** Sets sample questions on several documents with a single write. */
export function setPrompts(prompts: Record<string, string>): void {
  docs = docs.map((d) => (prompts[d.id]?.trim() ? { ...d, prompt: prompts[d.id].trim() } : d));
  persist();
}
