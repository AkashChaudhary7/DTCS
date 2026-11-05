import React, { useCallback, useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Medal,
  RefreshCw,
  Search,
  Trophy,
} from 'lucide-react';
import { CategoryType, LeaderboardEntry, ShiftPaper } from '../shared/types';

interface LeaderboardViewProps {
  shifts: ShiftPaper[];
  initialCategory?: string;
  initialShiftNumber?: number;
  refreshSeconds?: number;
  onSelectCandidateResult: (submissionId: number) => void;
}

const CATEGORIES: Array<'All' | CategoryType> = [
  'All',
  'General',
  'OBC',
  'EWS',
  'SC',
  'ST',
  'Other',
];

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({
  shifts,
  initialCategory = 'All',
  initialShiftNumber = 0,
  refreshSeconds = 20,
  onSelectCandidateResult,
}) => {
  const [viewScope, setViewScope] = useState<'overall' | 'category' | 'shift'>(
    initialShiftNumber > 0
      ? 'shift'
      : initialCategory && initialCategory !== 'All'
      ? 'category'
      : 'overall'
  );
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory || 'All');
  const [selectedShiftNumber, setSelectedShiftNumber] = useState<number>(
    initialShiftNumber || 0
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [podium, setPodium] = useState<LeaderboardEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>(
    new Date().toLocaleTimeString()
  );

  useEffect(() => {
    if (initialShiftNumber && initialShiftNumber > 0) {
      setViewScope('shift');
      setSelectedShiftNumber(initialShiftNumber);
    } else if (initialCategory && initialCategory !== 'All') {
      setViewScope('category');
      setSelectedCategory(initialCategory);
    }
  }, [initialCategory, initialShiftNumber]);

  const fetchLeaderboard = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCategory && selectedCategory !== 'All') {
        params.set('category', selectedCategory);
      }
      if (selectedShiftNumber > 0) {
        params.set('shiftNumber', String(selectedShiftNumber));
      }
      if (searchQuery.trim()) {
        params.set('search', searchQuery.trim());
      }
      params.set('page', String(page));
      params.set('limit', String(limit));

      const resp = await fetch(`/api/leaderboard?${params.toString()}`);
      if (resp.ok) {
        const data = await resp.json();
        setEntries(data.entries || []);
        setPodium(data.podium || []);
        setTotal(data.total || 0);
        setLastRefreshedAt(new Date().toLocaleTimeString());
      }
    } finally {
      setIsLoading(false);
    }
  }, [selectedCategory, selectedShiftNumber, searchQuery, page, limit]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchLeaderboard, Math.max(15, refreshSeconds) * 1000);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshSeconds, fetchLeaderboard]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-8">
      {/* Header & View Mode Switcher */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>SQL DENSE_RANK() Engine</span>
              <span aria-hidden="true">·</span>
              <span>Last synced {lastRefreshedAt}</span>
              <span aria-hidden="true">·</span>
              <span>{total} Candidates in Scope</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-950 dark:text-white mt-1">
              Live DSSSB TGT CS Leaderboard
            </h1>
          </div>

          {/* 3-Mode Segmented Scope Switcher: Overall | Category-Wise | Shift-Wise (1-18) */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setViewScope('overall');
                  setSelectedCategory('All');
                  setSelectedShiftNumber(0);
                  setPage(1);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  viewScope === 'overall'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Overall Combined
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewScope('category');
                  if (selectedCategory === 'All') setSelectedCategory('General');
                  setSelectedShiftNumber(0);
                  setPage(1);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  viewScope === 'category'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Category-Wise
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewScope('shift');
                  if (selectedShiftNumber === 0) setSelectedShiftNumber(1);
                  setPage(1);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  viewScope === 'shift'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Shift-Wise (1–18)
              </button>
            </div>

            <button
              type="button"
              onClick={fetchLeaderboard}
              className="px-3 py-2 text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Dedicated Category Tabs when Category-Wise or Overall is active */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-1.5">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(cat);
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-blue-700 text-white font-semibold'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  {cat === 'All' ? 'All Categories' : cat}
                </button>
              ))}
            </div>

            {/* Search & Shift Selector */}
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-60">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search candidate name..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <select
                aria-label="Filter by Examination Shift"
                value={selectedShiftNumber}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setSelectedShiftNumber(val);
                  if (val > 0) setViewScope('shift');
                  setPage(1);
                }}
                className="px-3 py-1.5 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value={0}>All 18 Shifts Combined</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.shift_number}>
                    Shift {String(s.shift_number).padStart(2, '0')} ({s.exam_date})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 18-Shift Quick Selector Strip when in Shift-Wise View */}
          {viewScope === 'shift' && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                Select Individual Shift Leaderboard (Shifts 1–18):
              </div>
              <div className="grid grid-cols-6 sm:grid-cols-9 lg:grid-cols-18 gap-1.5">
                {Array.from({ length: 18 }, (_, i) => i + 1).map((sNum) => (
                  <button
                    key={sNum}
                    type="button"
                    onClick={() => {
                      setSelectedShiftNumber(sNum);
                      setPage(1);
                    }}
                    className={`py-1.5 text-xs font-mono tabular-nums rounded-md border transition-colors cursor-pointer ${
                      selectedShiftNumber === sNum
                        ? 'bg-blue-700 text-white border-blue-700 font-bold'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-blue-500'
                    }`}
                  >
                    S{sNum}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Top 3 Podium Section */}
      {podium.length > 0 && page === 1 && !searchQuery && (
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {podium.map((p, idx) => (
            <div
              key={p.id}
              onClick={() => onSelectCandidateResult(p.id)}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex items-center justify-between hover:border-blue-500 transition-colors cursor-pointer"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  {idx === 0 ? (
                    <Trophy className="w-4 h-4 text-amber-500" />
                  ) : (
                    <Medal className="w-4 h-4 text-blue-600" />
                  )}
                  <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                    Rank #{p.dense_rank}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{p.category}</span>
                  <span aria-hidden="true">·</span>
                  <span>Shift {p.shift_number}</span>
                </div>
                <h3 className="text-base font-bold text-slate-950 dark:text-white">
                  {p.student_name}
                </h3>
                <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  Sec A: {Number(p.section_a_score).toFixed(1)} · Sec B:{' '}
                  {Number(p.section_b_score).toFixed(1)} · Acc: {Number(p.accuracy).toFixed(1)}%
                </div>
              </div>

              <div className="text-right">
                <div className="text-2xl font-bold font-mono tabular-nums text-blue-700 dark:text-blue-400">
                  {Number(p.score).toFixed(2)}
                </div>
                <div className="text-[11px] text-slate-400">/ 200.00</div>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Main High-Density Leaderboard Table */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4 font-medium">Dense Rank</th>
                <th className="py-3 px-4 font-medium">Candidate Name</th>
                <th className="py-3 px-4 font-medium">Category · Shift · Date</th>
                <th className="py-3 px-4 font-medium text-right">C / W / U</th>
                <th className="py-3 px-4 font-medium text-right">Sec A / Sec B</th>
                <th className="py-3 px-4 font-medium text-right">Accuracy</th>
                <th className="py-3 px-4 font-medium text-right">Raw Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  onClick={() => onSelectCandidateResult(entry.id)}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
                >
                  <td className="py-3 px-4 font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                    #{entry.dense_rank}
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                    {entry.student_name}
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {entry.category}
                    </span>
                    <span className="mx-1.5" aria-hidden="true">
                      ·
                    </span>
                    <span>Shift {entry.shift_number}</span>
                    <span className="mx-1.5" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-mono tabular-nums">{entry.exam_date}</span>
                    <span className="mx-1.5" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-mono">v{entry.answer_key_version}</span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-xs">
                    <span className="text-emerald-700 dark:text-emerald-400">
                      {entry.correct}
                    </span>
                    <span className="mx-1 text-slate-400">/</span>
                    <span className="text-rose-700 dark:text-rose-400">
                      {entry.incorrect}
                    </span>
                    <span className="mx-1 text-slate-400">/</span>
                    <span className="text-slate-500">{entry.unattempted}</span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-600 dark:text-slate-300">
                    {Number(entry.section_a_score).toFixed(2)} /{' '}
                    {Number(entry.section_b_score).toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                    {Number(entry.accuracy).toFixed(1)}%
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-blue-700 dark:text-blue-400">
                    {Number(entry.score).toFixed(2)}
                  </td>
                </tr>
              ))}

              {!isLoading && entries.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-sm text-slate-500">
                    No candidate submissions match the current filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Pagination & Auto-Refresh Control */}
        <div className="px-4 py-3 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-4">
            <span className="font-mono tabular-nums">
              Page {page} of {totalPages} ({total} total results)
            </span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-slate-300 text-blue-700"
              />
              <span>Live auto-refresh ({refreshSeconds}s)</span>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md disabled:opacity-40 flex items-center gap-1 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md disabled:opacity-40 flex items-center gap-1 cursor-pointer"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
