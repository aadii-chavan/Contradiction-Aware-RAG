import styles from './Meter.module.css';

interface MeterProps {
  /** 0..1 */
  value: number;
  segments?: number;
  size?: 'md' | 'sm';
}

/** Segmented pill meter: filled pills are solid dark, the rest dashed outlines. */
export default function Meter({ value, segments = 8, size = 'md' }: MeterProps) {
  const filled = Math.round(Math.max(0, Math.min(1, value)) * segments);
  return (
    <div className={`${styles.meter} ${size === 'sm' ? styles.sm : ''}`} role="img" aria-label={`${filled} of ${segments}`}>
      {Array.from({ length: segments }, (_, i) => (
        <span key={i} className={i < filled ? styles.on : styles.off} />
      ))}
    </div>
  );
}
