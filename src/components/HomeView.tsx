import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Award,
  BarChart3,
  CheckCircle2,
  Clock,
  Database,
  Sparkles,
  Users,
} from 'lucide-react';
import { ExamConfig, LeaderboardEntry, ShiftPaper } from '../shared/types';
import { FaqSection } from './FaqSection';

interface HomeViewProps {
  exam: ExamConfig | null;
  stats: any;
  topLeaderboard: LeaderboardEntry[];
  onNavigate: (
    tab: 'home' | 'predictor' | 'leaderboard' | 'cutoff' | 'admin' | 'about',
    options?: { shiftPaperId?: number; shiftNumber?: number; resultId?: number }
  ) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  exam,
  stats,
  topLeaderboard,
  onNavigate,
}) => {
  const [countdown, setCountdown] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  }>({ days: 33, hours: 4, minutes: 45, seconds: 0 });

  useEffect(() => {
    const targetIso = exam?.exam_countdown_target || '2026-12-08T09:00:00+05:30';
    const updateTimer = () => {
      const targetMs = new Date(targetIso).getTime();
      const nowMs = Date.now();
      const diff = Math.max(0, targetMs - nowMs);
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);
      setCountdown({ days, hours, minutes, seconds });
    };
    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [exam?.exam_countdown_target]);

  const shifts: ShiftPaper[] = stats?.shifts_summary || [];

  return (
    <div className="space-y-8">
      {/* Minimalist Premium Hero */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 lg:p-10 shadow-2xs">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold tracking-wide text-blue-700 dark:text-blue-400">
              <span>Post Code 41/26</span>
              <span aria-hidden="true">·</span>
              <span>TGT Computer Science</span>
              <span aria-hidden="true">·</span>
              <span>18 Shifts</span>
            </div>

            <h1
              className="text-3xl sm:text-4xl lg:text-[42px] font-bold tracking-tight text-slate-950 dark:text-white leading-[1.12]"
              style={{ textWrap: 'balance' } as React.CSSProperties}
            >
              Instant Marks Calculator & Live Rank Predictor
            </h1>

            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-xl">
              Evaluate your official DSSSB response sheet, auto-discover shift answer keys,
              and compare your live dense rank across all 18 shifts.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                onClick={() => onNavigate('predictor')}
                className="px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white font-semibold text-sm rounded-xl transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>Check My Score & Rank</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => onNavigate('leaderboard')}
                className="px-5 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 font-semibold text-sm rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Live Leaderboard
              </button>
              <button
                onClick={() => onNavigate('cutoff')}
                className="px-4 py-3 text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white font-medium text-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Cutoff Predictor
              </button>
            </div>
          </div>

          {/* Right Panel: Official Draft Key Countdown (8 December 2026) */}
          <div className="lg:col-span-5 bg-slate-50/80 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 rounded-xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-3.5">
              <div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Official Draft Key Release
                </div>
                <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                  8 December 2026
                </div>
              </div>
              <span className="text-xs font-mono tabular-nums font-semibold text-blue-700 dark:text-blue-400">
                Post Code 41/26
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2.5 text-center">
              {[
                { label: 'Days', value: countdown.days },
                { label: 'Hours', value: countdown.hours },
                { label: 'Mins', value: countdown.minutes },
                { label: 'Secs', value: countdown.seconds, accent: true },
              ].map((item) => (
                <div
                  key={item.label}
                  className="py-3 px-2 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-lg"
                >
                  <div
                    className={`text-2xl font-bold font-mono tabular-nums ${
                      item.accent
                        ? 'text-blue-700 dark:text-blue-400'
                        : 'text-slate-950 dark:text-white'
                    }`}
                  >
                    {String(item.value).padStart(2, '0')}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {item.label}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
              <span className="font-mono tabular-nums">
                {exam?.total_questions || 200} MCQs
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400 font-medium">
                +{Number(exam?.marks_per_correct ?? 1).toFixed(2)} Correct
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-rose-700 dark:text-rose-400 font-medium">
                -{Number(exam?.negative_marks ?? 0.25).toFixed(2)} Negative
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Minimalist 4-Metric Telemetry Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Candidates</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-950 dark:text-white mt-1">
              {stats?.total_submissions ?? 0}
            </div>
          </div>
          <Users className="w-5 h-5 text-blue-700 dark:text-blue-400" />
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Discovered Keys</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-950 dark:text-white mt-1">
              {stats?.shifts_with_discovered_keys ?? 0}{' '}
              <span className="text-sm font-normal text-slate-400">
                / {stats?.total_shifts ?? 18}
              </span>
            </div>
          </div>
          <Database className="w-5 h-5 text-blue-700 dark:text-blue-400" />
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Mean Score</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-950 dark:text-white mt-1">
              {Number(stats?.average_score ?? 0).toFixed(1)}{' '}
              <span className="text-xs font-normal text-slate-400">
                ({Number(stats?.average_accuracy ?? 0).toFixed(0)}%)
              </span>
            </div>
          </div>
          <BarChart3 className="w-5 h-5 text-blue-700 dark:text-blue-400" />
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Top Score</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-blue-700 dark:text-blue-400 mt-1">
              {Number(stats?.highest_score ?? 0).toFixed(2)}
            </div>
          </div>
          <Award className="w-5 h-5 text-blue-700 dark:text-blue-400" />
        </div>
      </section>

      {/* Functional 2-Column Workspace: Top 5 Standings + Compact 18-Shift Grid */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Top 5 Live Leaderboard Preview (Strictly Rank, Name, and Raw Score) */}
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-3.5">
            <h2 className="text-base font-bold text-slate-950 dark:text-white">
              Live Top Standings
            </h2>
            <button
              onClick={() => onNavigate('leaderboard')}
              className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
            >
              Full Leaderboard →
            </button>
          </div>

          {topLeaderboard.length === 0 ? (
            <div className="py-10 px-4 text-center space-y-1.5 bg-slate-50/70 dark:bg-slate-950 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                0 Candidate Submissions Recorded
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                All earlier data has been reset to zero. Response-sheet evaluation opens after{' '}
                <strong className="text-slate-700 dark:text-slate-300">7 December 2026</strong>.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200/70 dark:divide-slate-800">
              {topLeaderboard.slice(0, 5).map((entry) => (
                <div
                  key={entry.id}
                  onClick={() => onNavigate('predictor', { resultId: entry.id })}
                  className="py-3 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 px-2 -mx-2 rounded-lg transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span className="w-7 text-sm font-mono tabular-nums font-bold text-slate-900 dark:text-white shrink-0">
                      #{entry.dense_rank}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {entry.student_name}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-base font-bold font-mono tabular-nums text-blue-700 dark:text-blue-400">
                      {Number(entry.score).toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Interactive 18-Shift Quick Discovery Grid */}
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-3.5">
            <h2 className="text-base font-bold text-slate-950 dark:text-white">
              18-Shift Answer Keys & Submissions
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400" />
              <span>Click any shift to evaluate</span>
            </span>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
            {shifts.map((s) => {
              const isReady =
                s.key_status === 'published' || s.key_status === 'verified';
              const isPending = s.key_status === 'pending_verification';
              const isConflict = s.key_status === 'conflict';

              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() =>
                    onNavigate('predictor', {
                      shiftPaperId: s.id,
                      shiftNumber: s.shift_number,
                    })
                  }
                  className={`p-3 rounded-xl border text-left transition-colors cursor-pointer flex flex-col justify-between ${
                    isReady
                      ? 'border-emerald-200/90 dark:border-emerald-900/70 bg-emerald-50/40 dark:bg-emerald-950/20 hover:border-emerald-400'
                      : isConflict
                      ? 'border-rose-300 dark:border-rose-900 bg-rose-50/40 dark:bg-rose-950/20'
                      : isPending
                      ? 'border-amber-200 dark:border-amber-900/70 bg-amber-50/40 dark:bg-amber-950/20'
                      : 'border-slate-200 dark:border-slate-800 hover:border-blue-500'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                      S{s.shift_number}
                    </span>
                    {isReady ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </div>
                  <div className="mt-2">
                    <div className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      {s.submission_count || 0} cand.
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {s.exam_date.slice(5)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-500 dark:text-slate-400">
            <span>Green = Verified Key Cached · Gray = 1st Submission Discovers Key</span>
            <button
              type="button"
              onClick={() => onNavigate('leaderboard', { shiftNumber: 1 })}
              className="text-blue-700 dark:text-blue-400 font-medium hover:underline cursor-pointer"
            >
              Shift Leaderboards →
            </button>
          </div>
        </div>
      </section>

      {/* Minimal & Concise Candidate FAQs */}
      <FaqSection />
    </div>
  );
};
