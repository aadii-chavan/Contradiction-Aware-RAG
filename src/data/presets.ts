export type PresetKey = 'direct' | 'temporal' | 'clean';

export interface ConflictSource {
  id: string;
  date: string;
  title: string;
  /** Excerpt split around the conflicting value so it can be highlighted. */
  pre: string;
  val: string;
  post: string;
}

export interface Chunk {
  id: string;
  text: string;
}

interface PresetBase {
  label: string;
  query: string;
  latA: string;
  latB: string;
  baseline: string;
  baseCite: string;
  aware: string;
  /** Top-k chunks in rank order. For conflict presets the first two are the conflicting pair. */
  chunks: Chunk[];
}

export interface ConflictPreset extends PresetBase {
  conflict: true;
  conflictType: string;
  pairIds: string;
  a: ConflictSource;
  b: ConflictSource;
}

export interface CleanPreset extends PresetBase {
  conflict: false;
}

export type Preset = ConflictPreset | CleanPreset;

export const PRESETS: Record<PresetKey, Preset> = {
  direct: {
    label: 'Direct conflict',
    conflict: true,
    query: 'What learning rate should we use to fine-tune ViT-B/16 on the histology set?',
    latA: '1.42 s',
    latB: '1.87 s',
    baseline:
      'Fine-tune ViT-B/16 with a peak learning rate of 3e-4 using AdamW, with linear warmup over the first 500 steps followed by cosine decay. This setting was validated on the histology split and converges within roughly 30 epochs. A batch size of 64 with weight decay 0.05 is recommended.',
    baseCite: 'DOC-04, DOC-07',
    conflictType: 'Direct conflict · same parameter, incompatible values',
    pairIds: 'DOC-04 ↔ DOC-09',
    a: {
      id: 'DOC-04',
      date: '2024-03-12',
      title: 'ViT fine-tuning recipe',
      pre: 'Use a peak learning rate of ',
      val: '3e-4',
      post: ' with AdamW and cosine decay.',
    },
    b: {
      id: 'DOC-09',
      date: '2024-06-30',
      title: 'Histology ablation log',
      pre: 'Runs diverged above 5e-5; the stable peak learning rate was ',
      val: '1e-5',
      post: '.',
    },
    aware:
      'The corpus gives two incompatible fine-tuning learning rates. DOC-04 recommends 3e-4; DOC-09, a later ablation on the same split, reports divergence above 5e-5 and settles on 1e-5. The notes don’t resolve which applies, though DOC-09 is specific to the histology set.',
    chunks: [
      { id: 'DOC-04', text: 'ViT fine-tuning recipe — peak LR 3e-4, AdamW, cosine decay after 500 warmup steps.' },
      { id: 'DOC-09', text: 'Histology ablation — LR sweep 1e-5 … 3e-4; divergence above 5e-5.' },
      { id: 'DOC-07', text: 'Warmup schedules — linear warmup reduces early loss spikes in ViTs.' },
      { id: 'DOC-12', text: 'AdamW notes — decoupled weight decay 0.05 used across vision runs.' },
    ],
  },
  temporal: {
    label: 'Temporal conflict',
    conflict: true,
    query: 'Does the ResNet-50 pipeline use batch normalization?',
    latA: '1.36 s',
    latB: '1.91 s',
    baseline:
      'Yes. The ResNet-50 pipeline applies standard batch normalization after each convolution, with momentum 0.1 and ε = 1e-5. Running statistics are frozen at evaluation time. This is the default configuration and works well for the lab’s image classification tasks.',
    baseCite: 'DOC-02',
    conflictType: 'Temporal conflict · newer note revises an older one',
    pairIds: 'DOC-02 ↔ DOC-11',
    a: {
      id: 'DOC-02',
      date: '2023-09-14',
      title: 'Pipeline config v1',
      pre: 'Each conv block is followed by ',
      val: 'BatchNorm',
      post: ' (momentum 0.1).',
    },
    b: {
      id: 'DOC-11',
      date: '2025-02-03',
      title: 'Pipeline changelog',
      pre: 'Switched normalization to ',
      val: 'GroupNorm (32)',
      post: ' at batch size 8 per GPU.',
    },
    aware:
      'The sources disagree over time. DOC-02 (Sept 2023) describes BatchNorm with momentum 0.1. DOC-11 (Feb 2025) records a switch to GroupNorm with 32 groups after instability at a per-GPU batch size of 8. The newer note likely supersedes the older configuration.',
    chunks: [
      { id: 'DOC-02', text: 'Pipeline config v1 — BatchNorm after each conv, momentum 0.1, ε 1e-5.' },
      { id: 'DOC-11', text: 'Changelog — BN replaced by GroupNorm(32); small-batch stats were noisy.' },
      { id: 'DOC-05', text: 'Mixed precision notes — fp16 autocast, loss scaling 2^16.' },
      { id: 'DOC-08', text: 'Eval protocol — single centre crop, 224 px, top-1 accuracy.' },
    ],
  },
  clean: {
    label: 'Clean control',
    conflict: false,
    query: 'What warmup schedule does the transformer baseline use?',
    latA: '1.29 s',
    latB: '1.71 s',
    baseline:
      'The transformer baseline uses linear warmup over the first 4,000 steps to a peak learning rate of 7e-4, followed by inverse square-root decay.',
    baseCite: 'DOC-07, DOC-03',
    aware:
      'All retrieved sources agree: linear warmup over 4,000 steps to a peak of 7e-4, then inverse square-root decay (DOC-07, DOC-03). No conflicting values were found in the retrieved context.',
    chunks: [
      { id: 'DOC-07', text: 'Warmup schedules — transformer baseline: 4k linear warmup, peak 7e-4.' },
      { id: 'DOC-03', text: 'Seq2seq baseline config — inverse-sqrt decay after warmup.' },
      { id: 'DOC-10', text: 'Label smoothing 0.1 used for all translation baselines.' },
      { id: 'DOC-12', text: 'AdamW notes — β2 = 0.98 for transformer runs.' },
    ],
  },
};

export const PRESET_KEYS = Object.keys(PRESETS) as PresetKey[];

/** Cosine similarity of the top-4 chunks, by rank. */
export const SCORES = [0.91, 0.89, 0.84, 0.78];

export interface Metric {
  label: string;
  value: string;
  base: string;
}

export const METRICS: Metric[] = [
  { label: 'Conflicts Detected', value: '18 / 20', base: '0 / 20' },
  { label: 'False Alarms', value: '1 / 10', base: '0 / 10' },
  { label: 'Attribution Accuracy', value: '94%', base: '61%' },
  { label: 'Avg Latency', value: '1.84 s', base: '1.39 s' },
];
