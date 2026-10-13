export interface EvalCase {
  query: string;
  /** Doc IDs of the seeded conflicting pair; empty for clean controls. */
  conflictIds: string[];
}

export const EVAL_SET: EvalCase[] = [
  { query: 'What learning rate should we use to fine-tune ViT-B/16 on the histology set?', conflictIds: ['DOC-04', 'DOC-09'] },
  { query: 'Does the ResNet-50 pipeline use batch normalization?', conflictIds: ['DOC-02', 'DOC-11'] },
  { query: 'What batch size should I use for ViT-B/16 histology fine-tuning?', conflictIds: ['DOC-04', 'DOC-06'] },
  { query: 'What warmup schedule does the transformer baseline use?', conflictIds: [] },
  { query: 'What label smoothing value is used for the translation baselines?', conflictIds: [] },
  { query: 'How is evaluation performed and which metric is reported?', conflictIds: [] },
  { query: 'What precision and loss scaling are used for vision runs?', conflictIds: [] },
  { query: 'How many patches are in the histology dataset and how are they split?', conflictIds: [] },
];
