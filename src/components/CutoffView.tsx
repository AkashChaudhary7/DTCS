import React, { useEffect, useState } from 'react';
import { BarChart3, Scale, TrendingUp } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CategoryCutoffEstimate } from '../shared/types';

export const CutoffView: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'cutoffs' | 'normalization'>(
    'cutoffs'
  );
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

  // Compute overall mean across active shifts for Normalization Insights
  const activeShifts = shiftComparison.filter((s) => Number(s.sample_size) > 0);
  const globalMeanScore =
    activeShifts.length > 0
      ? Number(
          (
            activeShifts.reduce((acc, s) => acc + Number(s.mean_score), 0) /
            activeShifts.length
          ).toFixed(2)
        )
      : 0;

  const hardestShift =
    activeShifts.length > 0
      ? [...activeShifts].sort((a, b) => Number(a.mean_score) - Number(b.mean_score))[0]
      : null;

  const easiestShift =
    activeShifts.length > 0
      ? [...activeShifts].sort((a, b) => Number(b.mean_score) - Number(a.mean_score))[0]
      : null;

  return (
    <div className="space-y-6">
      {/* Header & Sub-Tab Switcher (Category Cutoffs vs Normalization Insights) */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-blue-400">
            <span>Post Code 41/26</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">n = {totalSampleSize} Submissions</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-950 dark:text-white mt-0.5">
            {activeSubTab === 'cutoffs'
              ? 'Estimated Cutoffs'
              : 'Shift Normalization Insights'}
          </h1>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveSubTab('cutoffs')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'cutoffs'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            <span>Predicted Cutoffs</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('normalization')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'normalization'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Normalization Insights</span>
          </button>
        </div>
      </section>

      {activeSubTab === 'cutoffs' ? (
        <>
          {/* Category Cutoff Cards (Computed using backend category distributions) */}
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
                    Min {c.qualifying_min_pct}%
                  </span>
                </div>

                <div>
                  <div className="text-xs text-slate-500">Predicted Safe Score (/ 200)</div>
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

          {/* Overall Score Histogram */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-2xs">
            <h2 className="text-base font-bold text-slate-950 dark:text-white">
              Score Distribution Across Cohort
            </h2>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={buckets} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.35} />
                  <XAxis dataKey="range" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar
                    dataKey="count"
                    name="Candidates"
                    fill="#1d4ed8"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </>
      ) : (
        /* TAB 2: NORMALIZATION INSIGHTS */
        <div className="space-y-6">
          {/* 3-Card Summary of Shift Difficulty Variations */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-2xs">
              <div className="text-xs text-slate-500">Cohort Mean Score</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-950 dark:text-white mt-1">
                {globalMeanScore.toFixed(2)}{' '}
                <span className="text-xs font-normal text-slate-400">/ 200</span>
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Baseline reference across {activeShifts.length} active shifts
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-2xs">
              <div className="text-xs text-slate-500">Toughest Shift (Lowest Avg)</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 mt-1">
                {hardestShift
                  ? `Shift ${hardestShift.shift_number} (${Number(hardestShift.mean_score).toFixed(1)})`
                  : '—'}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Expected positive normalization boost
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-2xs">
              <div className="text-xs text-slate-500">Highest Scoring Shift</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-blue-700 dark:text-blue-400 mt-1">
                {easiestShift
                  ? `Shift ${easiestShift.shift_number} (${Number(easiestShift.mean_score).toFixed(1)})`
                  : '—'}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Anchor ceiling shift in current sample
              </div>
            </div>
          </div>

          {/* Comparative Visualization of Average Scores Across Shifts */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-950 dark:text-white flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                  <span>Average vs Top Score Across Exam Shifts</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Dashed line indicates overall cohort average ({globalMeanScore.toFixed(1)}).
                  Shifts below the line typically gain marks during normalization.
                </p>
              </div>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={activeShifts.map((s) => ({
                    ...s,
                    label: `Shift ${s.shift_number}`,
                  }))}
                  margin={{ top: 14, right: 16, left: -12, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.35} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 200]} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <ReferenceLine
                    y={globalMeanScore}
                    stroke="#dc2626"
                    strokeDasharray="4 4"
                    label={{
                      value: `Avg ${globalMeanScore.toFixed(1)}`,
                      position: 'insideTopRight',
                      fontSize: 11,
                      fill: '#dc2626',
                    }}
                  />
                  <Bar
                    dataKey="mean_score"
                    name="Shift Average Score"
                    fill="#1d4ed8"
                    radius={[6, 6, 0, 0]}
                  />
                  <Bar
                    dataKey="max_score"
                    name="Shift Top Score"
                    fill="#0f766e"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Shift Difficulty & Expected Normalization Adjustment Table */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950 text-xs text-slate-500">
                    <th className="py-3 px-5 font-medium">Shift</th>
                    <th className="py-3 px-5 font-medium">Exam Date</th>
                    <th className="py-3 px-5 font-medium text-right">Candidates</th>
                    <th className="py-3 px-5 font-medium text-right">Shift Mean</th>
                    <th className="py-3 px-5 font-medium text-right">Top Score</th>
                    <th className="py-3 px-5 font-medium">Relative Difficulty</th>
                    <th className="py-3 px-5 font-medium text-right">Est. Shift Adjustment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800 text-xs sm:text-sm">
                  {activeShifts.map((s) => {
                    const mean = Number(s.mean_score);
                    const delta = Number(((globalMeanScore - mean) * 0.85).toFixed(2));
                    const difficultyLabel =
                      delta > 1.5
                        ? 'Tougher Shift'
                        : delta < -1.5
                        ? 'Easier Shift'
                        : 'Moderate Shift';

                    return (
                      <tr key={s.shift_number}>
                        <td className="py-3 px-5 font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                          Shift {s.shift_number}
                        </td>
                        <td className="py-3 px-5 font-mono tabular-nums text-slate-500">
                          {s.exam_date}
                        </td>
                        <td className="py-3 px-5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                          {s.sample_size}
                        </td>
                        <td className="py-3 px-5 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                          {mean.toFixed(2)}
                        </td>
                        <td className="py-3 px-5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                          {Number(s.max_score).toFixed(2)}
                        </td>
                        <td className="py-3 px-5 font-medium">
                          <span
                            className={
                              delta > 1.5
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : delta < -1.5
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-slate-600 dark:text-slate-400'
                            }
                          >
                            {difficultyLabel}
                          </span>
                        </td>
                        <td className="py-3 px-5 text-right font-mono tabular-nums font-bold">
                          <span
                            className={
                              delta >= 0
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-rose-700 dark:text-rose-400'
                            }
                          >
                            {delta >= 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
