import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Award,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  HelpCircle,
  KeyRound,
  ShieldCheck,
  Trophy,
  XCircle,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { StudentSubmissionDetail } from '../shared/types';

interface ResultViewProps {
  result: StudentSubmissionDetail;
  discoveryEvent?: string;
  warnings?: string[];
  onBackToPredictor: () => void;
  onViewLeaderboard: (options?: { shiftNumber?: number; category?: string }) => void;
}

export const ResultView: React.FC<ResultViewProps> = ({
  result,
  discoveryEvent,
  onBackToPredictor,
  onViewLeaderboard,
}) => {
  const [objections, setObjections] = useState<any[]>([]);

  useEffect(() => {
    fetch(`/api/objections?shiftNumber=${result.shift_number}`)
      .then((r) => r.json())
      .then((d) => setObjections(d.items || []))
      .catch(() => {});
  }, [result.shift_number]);

  const chartData = [
    { name: 'Raw Score', score: result.score },
    { name: 'Est. Normalized', score: result.estimated_normalized_score || result.score },
    { name: `Shift ${result.shift_number} Avg`, score: result.shift_average_score },
    { name: 'Overall Avg', score: result.overall_average_score },
  ];

  const handleDownloadScorecardJson = () => {
    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DSSSB_41_26_Scorecard_${result.extracted_metadata?.roll_number || result.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={onBackToPredictor}
          className="text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white flex items-center gap-1.5 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Evaluate Another URL</span>
        </button>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleDownloadScorecardJson}
            className="px-3.5 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white rounded-xl flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Scorecard</span>
          </button>
          <button
            onClick={() => onViewLeaderboard({ shiftNumber: result.shift_number })}
            className="px-3.5 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white rounded-xl transition-colors cursor-pointer"
          >
            Shift {result.shift_number} Rank
          </button>
          <button
            onClick={() => onViewLeaderboard({ category: result.category })}
            className="px-3.5 py-2 text-xs font-semibold bg-blue-700 hover:bg-blue-800 text-white rounded-xl transition-colors cursor-pointer"
          >
            {result.category} Leaderboard
          </button>
        </div>
      </div>

      {/* Executive Scorecard */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xs space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-slate-200/80 dark:border-slate-800 pb-6">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {result.category}
              </span>
              {result.extracted_metadata?.sub_category &&
                result.extracted_metadata.sub_category !== 'None' && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{result.extracted_metadata.sub_category}</span>
                  </>
                )}
              <span aria-hidden="true">·</span>
              <span>Shift {result.shift_number}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{result.exam_date}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">Post Code 41/26</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-slate-950 dark:text-white">
              {result.student_name}
            </h1>

            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 pt-0.5">
              {result.extracted_metadata?.roll_number && (
                <span className="font-mono tabular-nums">
                  Roll: {result.extracted_metadata.roll_number}
                </span>
              )}
              {result.extracted_metadata?.test_center_code && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    Center: {result.extracted_metadata.test_center_code}
                  </span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span className="text-blue-700 dark:text-blue-400 font-medium flex items-center gap-1">
                <KeyRound className="w-3.5 h-3.5" />
                <span>
                  {discoveryEvent === 'initiated_new_key'
                    ? 'Discovered Shift Key v1'
                    : `Key v${result.answer_key_version_number} (${result.answer_key_status})`}
                </span>
              </span>
            </div>
          </div>

          {/* Raw Score, Normalized Score & Accuracy Cluster */}
          <div className="flex flex-wrap items-center gap-5 bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 rounded-xl px-5 py-4">
            <div>
              <div className="text-xs text-slate-500">Raw Score</div>
              <div className="text-3xl font-bold font-mono tabular-nums text-blue-700 dark:text-blue-400 mt-0.5">
                {result.score.toFixed(2)}
              </div>
            </div>
            <div className="h-10 w-px bg-slate-200 dark:bg-slate-800" />
            <div>
              <div className="text-xs text-slate-500">Est. Normalized</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 mt-0.5">
                {(result.estimated_normalized_score ?? result.score).toFixed(2)}
              </div>
            </div>
            <div className="h-10 w-px bg-slate-200 dark:bg-slate-800" />
            <div>
              <div className="text-xs text-slate-500">Accuracy</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                {result.accuracy.toFixed(1)}%
              </div>
            </div>
          </div>
        </div>

        {/* 4-Column Standing & Qualifying Gate Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 bg-slate-50/70 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 rounded-xl">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Overall Rank</span>
              <Trophy className="w-4 h-4 text-blue-700 dark:text-blue-400" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-950 dark:text-white mt-1.5">
              #{result.overall_rank}{' '}
              <span className="text-xs font-normal text-slate-400">
                / {result.total_candidates}
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
              {result.overall_percentile.toFixed(1)}%ile Overall
            </div>
          </div>

          <div className="p-4 bg-slate-50/70 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 rounded-xl">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{result.category} Rank</span>
              <Award className="w-4 h-4 text-blue-700 dark:text-blue-400" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-950 dark:text-white mt-1.5">
              #{result.category_rank}{' '}
              <span className="text-xs font-normal text-slate-400">
                / {result.total_category_candidates}
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
              {result.category_percentile.toFixed(1)}%ile in {result.category}
            </div>
          </div>

          <div className="p-4 bg-slate-50/70 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 rounded-xl">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Shift {result.shift_number} Rank</span>
              <FileSpreadsheet className="w-4 h-4 text-blue-700 dark:text-blue-400" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-950 dark:text-white mt-1.5">
              #{result.shift_rank}{' '}
              <span className="text-xs font-normal text-slate-400">
                / {result.total_shift_candidates}
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
              {result.shift_percentile.toFixed(1)}%ile in Shift
            </div>
          </div>

          <div className="p-4 bg-slate-50/70 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 rounded-xl">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Sectional Gate ({result.qualifying_min_pct || 40}%)</span>
              <ShieldCheck className="w-4 h-4 text-blue-700 dark:text-blue-400" />
            </div>
            <div className="text-lg font-bold font-mono tabular-nums text-slate-950 dark:text-white mt-1.5">
              A: {result.section_a_score.toFixed(1)} · B: {result.section_b_score.toFixed(1)}
            </div>
            <div
              className={`text-xs font-medium mt-1 ${
                result.overall_qualified !== false
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-rose-700 dark:text-rose-400'
              }`}
            >
              {result.overall_qualified !== false
                ? 'Both Parts Qualified'
                : 'Below Sectional Min'}
            </div>
          </div>
        </div>

        {/* Attempt Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-50/70 dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800">
            <span className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Correct</span>
            </span>
            <span className="font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-400">
              {result.correct}
            </span>
          </div>

          <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-50/70 dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800">
            <span className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
              <XCircle className="w-4 h-4 text-rose-600" />
              <span>Wrong</span>
            </span>
            <span className="font-mono tabular-nums font-bold text-rose-700 dark:text-rose-400">
              {result.incorrect}
            </span>
          </div>

          <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-50/70 dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800">
            <span className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-slate-400" />
              <span>Skipped</span>
            </span>
            <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">
              {result.unattempted}
            </span>
          </div>

          <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-50/70 dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800">
            <span className="text-xs text-slate-600 dark:text-slate-400">Dropped</span>
            <span className="font-mono tabular-nums font-bold text-blue-700 dark:text-blue-400">
              {result.dropped}
            </span>
          </div>
        </div>
      </section>

      {/* Visual Section Breakdown & Benchmark Chart */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-950 dark:text-white">
            Section Breakdown
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                  <th className="py-2 pr-3 font-medium">Section</th>
                  <th className="py-2 px-2 font-medium text-right">C / W / U</th>
                  <th className="py-2 px-2 font-medium text-right">Accuracy</th>
                  <th className="py-2 pl-2 font-medium text-right">Marks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800 text-xs sm:text-sm">
                {result.section_breakdown.map((sec) => (
                  <tr key={sec.section_name}>
                    <td className="py-3 pr-3 font-medium text-slate-900 dark:text-white">
                      {sec.section_name.replace(/^Section [AB]: /, '')}
                    </td>
                    <td className="py-3 px-2 text-right font-mono tabular-nums text-xs">
                      <span className="text-emerald-700 dark:text-emerald-400">
                        {sec.correct}
                      </span>
                      <span className="mx-1 text-slate-400">/</span>
                      <span className="text-rose-700 dark:text-rose-400">
                        {sec.incorrect}
                      </span>
                      <span className="mx-1 text-slate-400">/</span>
                      <span className="text-slate-500">{sec.unattempted}</span>
                    </td>
                    <td className="py-3 px-2 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {sec.accuracy.toFixed(0)}%
                    </td>
                    <td className="py-3 pl-2 text-right font-mono tabular-nums font-bold text-blue-700 dark:text-blue-400">
                      {sec.score.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 flex flex-col justify-between space-y-4">
          <h2 className="text-base font-bold text-slate-950 dark:text-white">
            Raw vs Normalized Benchmark
          </h2>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.35} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 200]} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(val: any) => [`${Number(val).toFixed(2)} / 200`, 'Score']}
                />
                <Bar dataKey="score" fill="#1d4ed8" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Smart Draft-Key Objection Radar (8 Dec 2026 Challenge Helper) */}
      {objections.length > 0 && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-950 dark:text-white flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              <span>
                Shift {result.shift_number} Draft-Key Objection Radar (8 Dec 2026 Window)
              </span>
            </h2>
            <span className="text-xs text-slate-500">
              Questions with high peer disagreement against provisional key
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {objections.slice(0, 6).map((obj) => (
              <div
                key={`${obj.question_id}-${obj.popular_choice}`}
                className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-mono font-bold text-slate-900 dark:text-white">
                    Q.{obj.question_id}
                  </div>
                  <div className="text-slate-500 truncate max-w-[160px]">
                    {obj.section_name.replace(/^Section [AB]: /, '')}
                  </div>
                </div>
                <div className="text-right font-mono tabular-nums">
                  <div className="text-rose-700 dark:text-rose-400">
                    Key: {obj.official_key} → Peer: {obj.popular_choice}
                  </div>
                  <div className="text-slate-500">{obj.disagreement_pct}% chose {obj.popular_choice}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
