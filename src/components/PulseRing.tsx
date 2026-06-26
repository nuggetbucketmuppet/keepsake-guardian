import { motion } from "framer-motion";
import { scoreColor, scoreLabel } from "./ui-kit";

export function PulseRing({ score }: { score: number }) {
  const color = scoreColor(score);
  // Pulse faster as resilience drops: 0.9s at 0, ~2.6s at 100
  const duration = 0.9 + (score / 100) * 1.7;

  return (
    <div className="relative flex h-72 w-72 items-center justify-center sm:h-80 sm:w-80">
      {/* Concentric pulsing rings */}
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="absolute rounded-full border-2"
          style={{ borderColor: color, width: 220, height: 220 }}
          initial={{ scale: 0.85, opacity: 0.6 }}
          animate={{ scale: 1.55, opacity: 0 }}
          transition={{ duration, repeat: Infinity, delay: (duration / 3) * i, ease: "easeOut" }}
        />
      ))}

      {/* Static rings */}
      <div className="absolute h-[230px] w-[230px] rounded-full border" style={{ borderColor: `${color}30` }} />
      <div className="absolute h-[185px] w-[185px] rounded-full border" style={{ borderColor: `${color}25` }} />

      {/* Rotating accent arc */}
      <motion.svg
        className="absolute"
        width={250}
        height={250}
        viewBox="0 0 250 250"
        animate={{ rotate: 360 }}
        transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
      >
        <circle
          cx={125}
          cy={125}
          r={110}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * 691} 691`}
          opacity={0.9}
        />
      </motion.svg>

      {/* Core */}
      <div
        className="flex h-44 w-44 flex-col items-center justify-center rounded-full"
        style={{
          background: `radial-gradient(circle, ${color}22 0%, #1a1d27 70%)`,
          boxShadow: `0 0 60px -10px ${color}80, inset 0 0 30px ${color}20`,
        }}
      >
        <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          Resilience Score
        </span>
        <motion.span
          className="font-display text-6xl font-extrabold"
          style={{ color }}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 120 }}
        >
          {score}
          <span className="text-2xl">%</span>
        </motion.span>
        <span className="mt-1 text-xs font-semibold" style={{ color }}>
          {scoreLabel(score)}
        </span>
      </div>
    </div>
  );
}
