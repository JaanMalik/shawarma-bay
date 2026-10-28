import Link from 'next/link';

/** Placeholder mark until the restaurant's own logo file is added. */
export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="23" fill="var(--color-ember)" />
      <circle cx="24" cy="24" r="18.5" fill="none" stroke="white" strokeOpacity="0.35" strokeWidth="1.5" />
      {/* A shawarma cone on its spit */}
      <path d="M24 9v30" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M17.5 14h13l-2.4 18h-8.2z" fill="white" />
      <path d="M18.4 19.5h11.2M19.1 25h9.8" stroke="var(--color-ember)" strokeWidth="1.6" />
    </svg>
  );
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark size={38} />
      <span className="display text-[1.6rem] leading-none">Shawarma Bay</span>
    </Link>
  );
}
