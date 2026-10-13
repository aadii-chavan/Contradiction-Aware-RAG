export type PresetKey = 'direct' | 'temporal' | 'clean';

export interface Preset {
  label: string;
  query: string;
  /** Whether the corpus is seeded with a conflict for this query. */
  conflict: boolean;
}

export const PRESETS: Record<PresetKey, Preset> = {
  direct: {
    label: 'Direct conflict',
    conflict: true,
    query: 'What learning rate should we use to fine-tune ViT-B/16 on the histology set?',
  },
  temporal: {
    label: 'Temporal conflict',
    conflict: true,
    query: 'Does the ResNet-50 pipeline use batch normalization?',
  },
  clean: {
    label: 'Clean control',
    conflict: false,
    query: 'What warmup schedule does the transformer baseline use?',
  },
};

export const PRESET_KEYS = Object.keys(PRESETS) as PresetKey[];
