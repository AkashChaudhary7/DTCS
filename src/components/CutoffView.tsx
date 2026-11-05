import React, { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CategoryCutoffEstimate } from '../shared/types';

export const CutoffView: React.FC = () => {
  const [categories, setCategories] = useState<CategoryCutoffEstimate[]>([]);
  const [totalSampleSize, setTotalSampleSize] = useState(0);
  const [buckets, setBuckets] = useState<Array<{ range: string; count: number }>>([]);
  const [shiftComparison, setShiftComparison] = useState<any[]>([]);

  useEffect(() => {
    const loadCutoff = async () => {
      try {
        const resp = await fetch('/api/cutoff');
        if (resp.ok) {
          const data = await resp.json();
          setCategories(data.categories || []);
          setTotalSampleSize(data.totalSampleSize || 0);
          setBuckets(data.scoreDistributionBuckets || []);
          setShiftComparison(
            (data.shiftComparison || []).filter((s: any) => Number(s.sample_size) > 0)
          );
        }
      } catch {
        // ignore
      }
    };
    loadCutoff();
  }, []);

  return (
    <div className="space-y-6">
      {/* Compact Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-blue-400">
            <span>Post Code 41/26</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">n = {totalSampleSize} Candidates</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-950 dark:text-white mt-0.5">
            Estimated Category Cutoffs
          </h1>
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Based on live P75–P85 percentiles (/ 200 Marks)
        </span>
      </div>

      {/* Visual Category Cutoff Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map((c) => (
          <div
            key={c.category}
            className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-4 shadow-2xs"
          >
            <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-3">
              <h2 className="text-base font-bold text-slate-950 dark:text-white">
                {c.category}
              </h2>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                Min {c.qualifying_min_pct}% · n={c.sample_size}
              </span>
            </div>

            <div>
              <div className="text-xs text-slate-500">Predicted Safe Range</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-blue-700 dark:text-blue-400 mt-1">
                {c.estimated_safe_low.toFixed(1)} – {c.estimated_safe_high.toFixed(1)}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
              <div>
                <div className="text-slate-400">Mean</div>
                <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                  {c.mean_score.toFixed(1)}
                </div>
              </div>
              <div>
                <div className="text-slate-400">P75 / P85</div>
                <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                  {c.p75_score.toFixed(0)} / {c.p85_score.toFixed(0)}
                </div>
              </div>
              <div>
                <div className="text-slate-400">Top</div>
                <div className="font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
                  {c.top_score.toFixed(1)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* Side-by-Side Analytics Charts */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-950 dark:text-white">
            Score Distribution
          </h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={buckets} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.35} />
                <XAxis dataKey="range" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" name="Candidates" fill="#1d4ed8" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-950 dark:text-white">
            Shift Mean vs Top Score
          </h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={shiftComparison.map((s) => ({
                  ...s,
                  label: `S${s.shift_number}`,
                }))}
                margin={{ top: 10, right: 12, left: -16, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.35} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 200]} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="mean_score" name="Shift Mean" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar dataKey="max_score" name="Shift High" fill="#0f766e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>
    </div>
  );
};
