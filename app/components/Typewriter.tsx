"use client";

interface TypewriterProps {
  text: string;
  /** ms per character */
  speed?: number;
  /** delay before starting (ms) */
  delay?: number;
  /** optional className for each character span */
  charClassName?: string;
  /** key prefix to force remount */
  id?: string;
}

export default function Typewriter({
  text,
  speed = 45,
  delay = 0,
  charClassName = "",
  id = "",
}: TypewriterProps) {
  return (
    <span key={id} aria-label={text}>
      {Array.from(text).map((char, i) => (
        <span
          key={`${id}-${i}`}
          className={`header-character ${charClassName}`}
          aria-hidden="true"
          style={{ animationDelay: `${delay + i * speed}ms` }}
        >
          {char === " " ? "\u00a0" : char}
        </span>
      ))}
    </span>
  );
}
