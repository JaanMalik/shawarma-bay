'use client';

export function QuantityStepper({
  value,
  onChange,
  min = 0,
  max = 20,
  label,
  size = 'md',
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label: string;
  size?: 'sm' | 'md';
}) {
  const button = size === 'sm' ? 'h-8 w-8 text-base' : 'h-11 w-11 text-lg';
  return (
    <div className="inline-flex items-center rounded-full border-[1.5px] border-line bg-white">
      <button
        type="button"
        className={`${button} rounded-full font-bold hover:bg-paper disabled:opacity-40`}
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label={value - 1 <= 0 ? `Remove ${label}` : `One less ${label}`}
      >
        −
      </button>
      <span className="min-w-7 text-center font-semibold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className={`${button} rounded-full font-bold hover:bg-paper disabled:opacity-40`}
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label={`One more ${label}`}
      >
        +
      </button>
    </div>
  );
}
