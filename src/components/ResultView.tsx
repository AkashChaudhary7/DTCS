import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  HelpCircle,
  KeyRound,
  Share2,
  ShieldCheck,
  Sparkles,
  Trophy,
  X,
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
import { apiFetch } from '../services/serverlessEngine';
import { ProgressRing } from './ProgressRing';
import { RankTrendChartD3 } from './RankTrendChartD3';

interface ResultViewProps {
  result: StudentSubmissionDetail;
  discoveryEvent?: string;
  warnings?: string[];
  onBackToPredictor: () => void;
  onViewLeaderboard: (options?: { shiftNumber?: number }) => void;
}

export const ResultView: React.FC<ResultViewProps> = ({
  result,
  discoveryEvent,
  onBackToPredictor,
  onViewLeaderboard,
}) => {
  const [objections, setObjections] = useState<any[]>([]);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareImageDataUrl, setShareImageDataUrl] = useState<string | null>(null);
  const [copiedShareText, setCopiedShareText] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    apiFetch(`/api/objections?shiftNumber=${result.shift_number}`)
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

  // Draw the social-ready summary card onto HTML5 Canvas
  const renderRankCardToCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = 1200;
    const height = 630;
    canvas.width = width;
    canvas.height = height;

    // Background gradient (Deep Slate / Royal Blue theme)
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, '#0f172a');
    bgGrad.addColorStop(0.55, '#1e293b');
    bgGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Subtle accent top bar
    const topBarGrad = ctx.createLinearGradient(0, 0, width, 0);
    topBarGrad.addColorStop(0, '#2563eb');
    topBarGrad.addColorStop(0.5, '#3b82f6');
    topBarGrad.addColorStop(1, '#10b981');
    ctx.fillStyle = topBarGrad;
    ctx.fillRect(0, 0, width, 10);

    // Outer frame border
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
    ctx.lineWidth = 2;
    ctx.strokeRect(36, 36, width - 72, height - 72);

    // Top Header Label
    ctx.fillStyle = '#60a5fa';
    ctx.font = '600 20px Inter, system-ui, sans-serif';
    ctx.fillText('DSSSB TGT COMPUTER SCIENCE · POST CODE 41/26', 76, 92);

    // Right badge in header
    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 18px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(
      `Shift ${result.shift_number} · ${result.exam_date}`,
      width - 76,
      92
    );
    ctx.textAlign = 'left';

    // Candidate Name
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 46px Space Grotesk, Inter, system-ui, sans-serif';
    const displayName =
      result.student_name.length > 28
        ? `${result.student_name.slice(0, 26)}...`
        : result.student_name;
    ctx.fillText(displayName, 76, 158);

    // Subtitle under candidate name
    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 20px Inter, system-ui, sans-serif';
    ctx.fillText(
      `Verified Response Sheet Evaluation · Accuracy ${result.accuracy.toFixed(1)}% (${result.correct}C / ${result.incorrect}W / ${result.unattempted}S)`,
      76,
      196
    );

    // Divider line
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(76, 228);
    ctx.lineTo(width - 76, 228);
    ctx.stroke();

    // 4 Metric Boxes
    const cards = [
      {
        label: 'RAW SCORE',
        value: `${result.score.toFixed(2)}`,
        sub: 'Out of 200.00',
        accent: '#60a5fa',
      },
      {
        label: 'EST. NORMALIZED',
        value: `${(result.estimated_normalized_score ?? result.score).toFixed(2)}`,
        sub: `Shift Avg: ${result.shift_average_score.toFixed(1)}`,
        accent: '#34d399',
      },
      {
        label: 'OVERALL RANK',
        value: `#${result.overall_rank}`,
        sub: `Top ${(100 - result.overall_percentile).toFixed(1)}% (${result.overall_percentile.toFixed(1)}%ile)`,
        accent: '#fbbf24',
      },
      {
        label: `SHIFT ${result.shift_number} RANK`,
        value: `#${result.shift_rank}`,
        sub: `${result.shift_percentile.toFixed(1)}%ile in Shift`,
        accent: '#f8fafc',
      },
    ];

    const boxWidth = 248;
    const boxHeight = 195;
    const gap = 18;
    const startX = 76;
    const startY = 264;

    cards.forEach((card, idx) => {
      const x = startX + idx * (boxWidth + gap);
      const y = startY;

      // Card fill
      ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
      ctx.beginPath();
      ctx.roundRect(x, y, boxWidth, boxHeight, 16);
      ctx.fill();

      // Card border
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(x, y, boxWidth, boxHeight, 16);
      ctx.stroke();

      // Label
      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 15px Inter, system-ui, sans-serif';
      ctx.fillText(card.label, x + 22, y + 42);

      // Value
      ctx.fillStyle = card.accent;
      ctx.font = '700 44px JetBrains Mono, monospace';
      ctx.fillText(card.value, x + 22, y + 110);

      // Subtext
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '500 16px Inter, system-ui, sans-serif';
      ctx.fillText(card.sub, x + 22, y + 158);
    });

    // Bottom bar
    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 18px Inter, system-ui, sans-serif';
    ctx.fillText(
      `Part A: ${result.section_a_score.toFixed(2)}/100  ·  Part B (CS): ${result.section_b_score.toFixed(2)}/100`,
      76,
      535
    );

    ctx.textAlign = 'right';
    ctx.fillStyle = '#60a5fa';
    ctx.font = '600 18px Inter, system-ui, sans-serif';
    ctx.fillText(
      'DSSSB TGT CS Analytics · Official Draft Key: 8 Dec 2026',
      width - 76,
      535
    );
    ctx.textAlign = 'left';

    try {
      setShareImageDataUrl(canvas.toDataURL('image/png'));
    } catch {
      // ignore canvas serialization issues
    }
  };

  useEffect(() => {
    if (isShareModalOpen) {
      const timer = setTimeout(() => {
        renderRankCardToCanvas();
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [isShareModalOpen, result]);

  const handleDownloadRankImage = () => {
    if (!shareImageDataUrl) {
      renderRankCardToCanvas();
    }
    const dataUrl =
      shareImageDataUrl || canvasRef.current?.toDataURL('image/png');
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `DSSSB_41_26_RankCard_${result.student_name.replace(/\s+/g, '_')}.png`;
    a.click();
  };

  const handleCopyShareText = () => {
    const shareSummary = `DSSSB TGT Computer Science (Post Code 41/26)\nCandidate: ${result.student_name}\nRaw Score: ${result.score.toFixed(2)} / 200 (Est. Normalized: ${(result.estimated_normalized_score ?? result.score).toFixed(2)})\nOverall Rank: #${result.overall_rank} (${result.overall_percentile.toFixed(1)}%ile)\nShift ${result.shift_number} Rank: #${result.shift_rank} · Accuracy: ${result.accuracy.toFixed(1)}%`;
    navigator.clipboard?.writeText(shareSummary);
    setCopiedShareText(true);
    setTimeout(() => setCopiedShareText(false), 2000);
  };

  const handleDownloadScorecardJson = () => {
    const publicSafeResult = {
      id: result.id,
      student_name: result.student_name,
      exam_date: result.exam_date,
      shift_number: result.shift_number,
      score: result.score,
      estimated_normalized_score: result.estimated_normalized_score,
      section_a_score: result.section_a_score,
      section_b_score: result.section_b_score,
      correct: result.correct,
      incorrect: result.incorrect,
      unattempted: result.unattempted,
      accuracy: result.accuracy,
      overall_rank: result.overall_rank,
      shift_rank: result.shift_rank,
      overall_percentile: result.overall_percentile,
      shift_percentile: result.shift_percentile,
      section_breakdown: result.section_breakdown,
    };
    const blob = new Blob([JSON.stringify(publicSafeResult, null, 2)], {
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
            type="button"
            onClick={() => setIsShareModalOpen(true)}
            className="px-4 py-2 text-xs font-semibold bg-blue-700 hover:bg-blue-800 text-white rounded-xl flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Share My Rank</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadScorecardJson}
            className="px-3.5 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white rounded-xl flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON</span>
          </button>
          <button
            type="button"
            onClick={() => onViewLeaderboard({ shiftNumber: result.shift_number })}
            className="px-3.5 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white rounded-xl transition-colors cursor-pointer"
          >
            Shift {result.shift_number} Leaderboard
          </button>
          <button
            type="button"
            onClick={() => onViewLeaderboard()}
            className="px-3.5 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white rounded-xl transition-colors cursor-pointer"
          >
            Overall Leaderboard
          </button>
        </div>
      </div>

      {/* Executive Scorecard (Category-free on public website) */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xs space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-slate-200/80 dark:border-slate-800 pb-6">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-blue-700 dark:text-blue-400">
                Shift {result.shift_number}
              </span>
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
              <span>Shift Benchmark</span>
              <Sparkles className="w-4 h-4 text-blue-700 dark:text-blue-400" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-950 dark:text-white mt-1.5">
              {result.shift_average_score.toFixed(1)}
            </div>
            <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
              Cohort Avg: {result.overall_average_score.toFixed(1)}
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

        {/* Visual Progress-Ring Gauges: Accuracy & Leaderboard Population Percentiles */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          <ProgressRing
            value={result.accuracy}
            label="Exam Accuracy"
            displayValue={`${result.accuracy.toFixed(1)}%`}
            sublabel={`${result.correct} Correct / ${result.correct + result.incorrect} Attempted`}
            colorClass="text-emerald-600 dark:text-emerald-400"
          />
          <ProgressRing
            value={result.overall_percentile}
            label="Overall Percentile"
            displayValue={`${result.overall_percentile.toFixed(1)}%ile`}
            sublabel={`Rank #${result.overall_rank} of ${result.total_candidates} Candidates`}
            colorClass="text-blue-600 dark:text-blue-400"
          />
          <ProgressRing
            value={result.shift_percentile}
            label={`Shift ${result.shift_number} Percentile`}
            displayValue={`${result.shift_percentile.toFixed(1)}%ile`}
            sublabel={`Rank #${result.shift_rank} of ${result.total_shift_candidates} in Shift`}
            colorClass="text-indigo-600 dark:text-indigo-400"
          />
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

      {/* D3 Rank Trend & Key Revision Trajectory */}
      <RankTrendChartD3 result={result} />

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

      {/* Share My Rank Summary Card Modal */}
      {isShareModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Share My Rank Summary Card"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <h2 className="text-base font-bold text-slate-950 dark:text-white">
                  Share My Rank Card
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Download your social-ready summary image for Telegram, WhatsApp, or X.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsShareModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Hidden Canvas + Responsive Image Preview */}
            <div className="bg-slate-950 rounded-xl overflow-hidden border border-slate-800">
              <canvas
                ref={canvasRef}
                width={1200}
                height={630}
                className="w-full h-auto block"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={handleCopyShareText}
                className="px-4 py-2.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white rounded-xl flex items-center gap-1.5 cursor-pointer"
              >
                {copiedShareText ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Copied Summary Text</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Summary Text</span>
                  </>
                )}
              </button>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsShareModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleDownloadRankImage}
                  className="px-5 py-2.5 text-xs font-semibold bg-blue-700 hover:bg-blue-800 text-white rounded-xl flex items-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Save as PNG Image</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
