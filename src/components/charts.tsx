import { useId } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { motion } from "framer-motion";
import { CountUp } from "./CountUp";
import { scoreColor, scoreLabel } from "./ui-kit";

/**
 * Animated donut gauge in the style of the industrial telemetry dashboard:
 * a thick ring that sweeps in on mount with a large count-up value at centre.
 */
export function DonutGauge({
  value,
  size = 140,
  label,
  color,
  unit = "%",
}: {
  value: number;
  size?: number;
  label?: string;
  color?: string;
  unit?: string;
}) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ringColor = color ?? scoreColor(value);
  const offset = c - (value / 100) * c;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#2a2f3d" strokeWidth={stroke} />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={ringColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            whileInView={{ strokeDashoffset: offset }}
            viewport={{ once: true }}
            transition={{ duration: 1.3, ease: [0.16, 1, 0.3, 1] }}
            style={{ filter: `drop-shadow(0 0 6px ${ringColor}80)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-3xl font-bold" style={{ color: ringColor }}>
            <CountUp value={value} suffix={unit} />
          </span>
        </div>
      </div>
      {label && <div className="text-center text-xs font-medium text-muted-foreground">{label}</div>}
    </div>
  );
}

type TrendPoint = { label: string; value: number };

/**
 * Animated gradient area chart, matching the amber "history" trend panel from
 * the reference telemetry dashboard.
 */
export function AreaTrend({
  data,
  color = "var(--primary)",
  height = 240,
  unit = "",
}: {
  data: TrendPoint[];
  color?: string;
  height?: number;
  unit?: string;
}) {
  const gid = useId().replace(/:/g, "");
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id={`area-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.45} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#2a2f3d" strokeDasharray="3 6" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: "#8b93a7", fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "#2a2f3d" }}
        />
        <YAxis
          tick={{ fill: "#8b93a7", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={40}
        />
        <Tooltip
          cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: "4 4" }}
          contentStyle={{
            background: "#1a1d27",
            border: "1px solid #2a2f3d",
            borderRadius: 10,
            fontSize: 12,
            color: "#f1f5f9",
          }}
          formatter={(v: number) => [`${v}${unit}`, "Value"]}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2.5}
          fill={`url(#area-${gid})`}
          dot={{ r: 3, fill: color, strokeWidth: 0 }}
          activeDot={{ r: 5, fill: color, stroke: "#0f1117", strokeWidth: 2 }}
          isAnimationActive
          animationDuration={1400}
          animationEasing="ease-out"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export { scoreLabel };
