import { useEffect, useRef, useState } from "react";
import { animate } from "framer-motion";

/**
 * Animated count-up number. Eases from 0 (or `from`) to `value` on mount and
 * whenever `value` changes. Renders tabular figures so the width stays stable.
 */
export function CountUp({
  value,
  from = 0,
  duration = 1.1,
  decimals = 0,
  suffix = "",
  prefix = "",
  className = "",
}: {
  value: number;
  from?: number;
  duration?: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
}) {
  const [display, setDisplay] = useState(from);
  const prev = useRef(from);

  useEffect(() => {
    const controls = animate(prev.current, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(v),
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, duration]);

  return (
    <span className={`tabular-nums ${className}`} suppressHydrationWarning>
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}
