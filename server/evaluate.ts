import type { EvalResult, EvalRow, EvalSide } from '../src/types';
import { EVAL_SET } from './evalSet';
import type { LlmConfig } from './llm';
import { runQuery } from './pipeline';

/** The baseline never reports conflicts structurally, so we detect it mentioning one in prose. */
const DISAGREE = /\b(conflict\w*|disagree\w*|contradict\w*|inconsisten\w*|discrepan\w*|incompatible)\b/i;

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

export async function runEvaluation(cfg: LlmConfig): Promise<EvalResult> {
  const rows: EvalRow[] = [];
  const lat = { baseline: 0, aware: 0 };

  // Sequential to stay inside provider rate limits.
  for (const c of EVAL_SET) {
    const r = await runQuery(cfg, c.query);
    const expect = c.conflictIds.length > 0;
    lat.baseline += r.baseline.latencyMs;
    lat.aware += r.aware.latencyMs;
    rows.push({
      query: c.query,
      expectConflict: expect,
      expectedIds: c.conflictIds,
      baselineFlagged: DISAGREE.test(r.baseline.answer),
      awareFlagged: r.aware.conflict,
      // Attribution: the answer names both seeded documents.
      baselineAttributed: expect && c.conflictIds.every((id) => r.baseline.cites.includes(id)),
      awareAttributed: expect && r.aware.conflict && sameSet(r.aware.pair.map((p) => p.id), c.conflictIds),
    });
  }

  const side = (flag: 'baselineFlagged' | 'awareFlagged', attr: 'baselineAttributed' | 'awareAttributed', ms: number): EvalSide => ({
    detected: rows.filter((r) => r.expectConflict && r[flag]).length,
    falseAlarms: rows.filter((r) => !r.expectConflict && r[flag]).length,
    attributed: rows.filter((r) => r[attr]).length,
    avgLatencyMs: Math.round(ms / rows.length),
  });

  return {
    conflictQueries: rows.filter((r) => r.expectConflict).length,
    cleanQueries: rows.filter((r) => !r.expectConflict).length,
    baseline: side('baselineFlagged', 'baselineAttributed', lat.baseline),
    aware: side('awareFlagged', 'awareAttributed', lat.aware),
    rows,
  };
}
