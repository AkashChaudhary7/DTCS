import React from 'react';

interface ProgressRingProps {
  value: number; // 0 to 100
  label: string;
  sublabel: string;
  displayValue?: string;
  colorClass?: string;
  size?: number;
  strokeWidth?: number;
}

export const ProgressRing: React.FC<ProgressRingProps> = ({
  value,
  label,
  sublabel,
  displayValue,
  colorClass = 'text-blue-600 dark:text-blue-400',
  size = 108,
  strokeWidth = 9,
}) => {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  return (
    <div className="flex items-center gap-4 p-4 bg-slate-50/70 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 rounded-xl">
      <div
        className="relative shrink-0 flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90 transform"
          role="img"
          aria-label={`${label}: ${displayValue || `${clamped.toFixed(1)}%`}`}
        >
          {/* Background Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-slate-200 dark:text-slate-800"
          />
          {/* Foreground Progress Arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className={`${colorClass} transition-all duration-500 ease-out`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-base font-bold font-mono tabular-nums text-slate-950 dark:text-white">
            {displayValue || `${clamped.toFixed(1)}%`}
          </span>
        </div>
      </div>

      <div className="min-w-0 space-y-1">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {label}
        </div>
        <div className="text-sm font-bold text-slate-900 dark:text-white">
          {clamped >= 80
            ? 'Top Tier Standing'
            : clamped >= 60
            ? 'Above Cohort Mean'
            : 'Developing Standing'}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
          {sublabel}
        </div>
      </div>
    </div>
  );
};
