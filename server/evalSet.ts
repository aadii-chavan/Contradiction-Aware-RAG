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
  { query: 'How many GPUs does each node in the cluster have?', conflictIds: ['DOC-13', 'DOC-14'] },
  { query: 'What is the default random seed for experiments?', conflictIds: ['DOC-15', 'DOC-16'] },
  { query: 'What input resolution does the U-Net segmentation model use?', conflictIds: ['DOC-17', 'DOC-18'] },
  { query: 'What dropout rate does the BERT classifier head use?', conflictIds: ['DOC-19', 'DOC-20'] },
  { query: 'What is the tokenizer vocabulary size?', conflictIds: ['DOC-21', 'DOC-22'] },
  { query: 'How many epochs is the speech recognition model trained for?', conflictIds: ['DOC-23', 'DOC-24'] },
  { query: 'What RandAugment magnitude is used for augmentation?', conflictIds: ['DOC-25', 'DOC-26'] },
  { query: 'How often are checkpoints saved during training?', conflictIds: ['DOC-27', 'DOC-28'] },
  { query: 'How many discriminator updates are made per generator update in the GAN?', conflictIds: ['DOC-29', 'DOC-30'] },
  { query: 'What embedding dimension does the dual encoder produce?', conflictIds: ['DOC-31', 'DOC-32'] },
  { query: 'What license covers the satellite imagery dataset?', conflictIds: ['DOC-33', 'DOC-34'] },
  { query: 'How many reviews are in the sentiment validation set?', conflictIds: ['DOC-35', 'DOC-36'] },
  { query: 'How many gradient accumulation steps does the language model training use?', conflictIds: ['DOC-37', 'DOC-38'] },
  { query: 'What is the p95 latency target for the deployed API?', conflictIds: ['DOC-39', 'DOC-40'] },
  { query: 'What beam size is used for image captioning?', conflictIds: ['DOC-41', 'DOC-42'] },
  { query: 'What replay buffer size does the DQN agent use?', conflictIds: ['DOC-43', 'DOC-44'] },
  { query: 'What similarity threshold marks two documents as duplicates in data cleaning?', conflictIds: ['DOC-45', 'DOC-46'] },
  { query: 'Where are experiment metrics logged and how often?', conflictIds: [] },
  { query: 'How many approvals does a pull request need before merging?', conflictIds: [] },
  { query: 'When are datasets backed up?', conflictIds: [] },
  { query: 'What must new members complete before getting cluster access?', conflictIds: [] },
  { query: 'What Python version do lab projects use?', conflictIds: [] },
];
