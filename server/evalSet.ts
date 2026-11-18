import cases from '../data/evalSet.json';

export interface EvalCase {
  query: string;
  /** Doc IDs of the seeded conflicting pair; empty for clean controls. */
  conflictIds: string[];
}

/** The 30 labelled queries, shared with the Python backend's retrieval benchmark via data/evalSet.json. */
export const EVAL_SET: EvalCase[] = cases;
