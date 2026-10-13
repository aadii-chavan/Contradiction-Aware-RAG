export interface Doc {
  id: string;
  title: string;
  date: string;
  text: string;
}

/** Seeded lab-notes corpus. Several documents deliberately contradict each other. */
export const CORPUS: Doc[] = [
  {
    id: 'DOC-01',
    title: 'Histology dataset overview',
    date: '2024-01-18',
    text: 'The histology set contains 24,000 stained tissue patches at 224 px resolution, split 80/10/10 into train, validation and test. Patches are labelled with one of nine tissue classes. Stain normalisation is applied before training.',
  },
  {
    id: 'DOC-02',
    title: 'Pipeline config v1',
    date: '2023-09-14',
    text: 'ResNet-50 pipeline configuration. Each conv block is followed by BatchNorm (momentum 0.1). Epsilon is 1e-5 and running statistics are frozen at evaluation time. Training uses SGD with momentum 0.9.',
  },
  {
    id: 'DOC-03',
    title: 'Seq2seq baseline config',
    date: '2023-11-02',
    text: 'The seq2seq transformer baseline uses inverse square-root learning rate decay after warmup. Dropout is 0.1 and the model has six encoder and six decoder layers.',
  },
  {
    id: 'DOC-04',
    title: 'ViT fine-tuning recipe',
    date: '2024-03-12',
    text: 'ViT-B/16 fine-tuning recipe. Use a peak learning rate of 3e-4 with AdamW and cosine decay. Linear warmup runs for 500 steps. Use a batch size of 64 and weight decay 0.05.',
  },
  {
    id: 'DOC-05',
    title: 'Mixed precision notes',
    date: '2024-04-20',
    text: 'All vision runs use fp16 autocast with dynamic loss scaling starting at 2^16. Gradient clipping is set to 1.0. bf16 was not evaluated.',
  },
  {
    id: 'DOC-06',
    title: 'GPU cluster notes',
    date: '2024-08-09',
    text: 'On the 8-GPU node the ViT-B/16 histology fine-tuning job runs with a global batch size of 128 to saturate memory. Jobs are queued through the shared scheduler with a 24 hour limit.',
  },
  {
    id: 'DOC-07',
    title: 'Warmup schedules',
    date: '2023-11-15',
    text: 'Linear warmup reduces early loss spikes in ViTs. The transformer baseline uses 4,000 steps of linear warmup to a peak learning rate of 7e-4.',
  },
  {
    id: 'DOC-08',
    title: 'Evaluation protocol',
    date: '2023-10-05',
    text: 'Evaluation uses a single centre crop at 224 px and reports top-1 accuracy. No test-time augmentation is applied. Each result is averaged over three seeds.',
  },
  {
    id: 'DOC-09',
    title: 'Histology ablation log',
    date: '2024-06-30',
    text: 'Learning rate sweep for ViT-B/16 on the histology split, from 1e-5 to 3e-4. Runs diverged above 5e-5; the stable peak learning rate was 1e-5. Warmup length had little effect.',
  },
  {
    id: 'DOC-10',
    title: 'Translation baselines',
    date: '2023-11-20',
    text: 'Label smoothing 0.1 is used for all translation baselines. Beam size is 5 with length penalty 0.6.',
  },
  {
    id: 'DOC-11',
    title: 'Pipeline changelog',
    date: '2025-02-03',
    text: 'ResNet-50 pipeline changelog. Switched normalization to GroupNorm (32 groups) at batch size 8 per GPU, because BatchNorm statistics were noisy at small batch sizes.',
  },
  {
    id: 'DOC-12',
    title: 'AdamW notes',
    date: '2024-02-10',
    text: 'AdamW with decoupled weight decay 0.05 is used across vision runs. For transformer runs beta2 is 0.98.',
  },
];
