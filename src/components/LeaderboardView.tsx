import React, { useCallback, useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Medal,
  RefreshCw,
  Search,
  Trophy,
} from 'lucide-react';
import { LeaderboardEntry, ShiftPaper } from '../shared/types';

interface LeaderboardViewProps {
  shifts: ShiftPaper[];
  initialShiftNumber?: number;
  refreshSeconds?: number;
  onSelectCandidateResult: (submissionId: number) => void;
}

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({
  shifts,
  initialShiftNumber = 0,
  refreshSeconds = 20,
  onSelectCandidateResult,
}) => {
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

  useEffect(() => {
    if (initialShiftNumber !== undefined) {
      setSelectedShiftNumber(initialShiftNumber);
    }
  }, [initialShiftNumber]);

  const fetchLeaderboard = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
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
      }
    } finally {
      setIsLoading(false);
    }
  }, [selectedShiftNumber, searchQuery, page, limit]);

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
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Minimalist Header & Controls */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-blue-400">
              <span>Post Code 41/26</span>
              <span aria-hidden="true">·</span>
              <span>{total} Candidates</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-950 dark:text-white mt-0.5">
              Live Leaderboard
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 sm:w-56">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search candidate name..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <select
              aria-label="Filter by Examination Shift"
              value={selectedShiftNumber}
              onChange={(e) => {
                setSelectedShiftNumber(Number(e.target.value));
                setPage(1);
              }}
              className="px-3 py-2 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value={0}>All Shifts</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.shift_number}>
                  Shift {String(s.shift_number).padStart(2, '0')}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={fetchLeaderboard}
              className="px-3 py-2 text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </section>

      {/* Minimalist Top 3 Podium (Only Rank, Name & Raw Score) */}
      {podium.length > 0 && page === 1 && !searchQuery && (
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {podium.map((p, idx) => (
            <div
              key={p.id}
              onClick={() => onSelectCandidateResult(p.id)}
              className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 flex items-center justify-between hover:border-blue-500 transition-colors cursor-pointer shadow-2xs"
            >
              <div className="space-y-1 min-w-0 pr-3">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  {idx === 0 ? (
                    <Trophy className="w-4 h-4 text-amber-500 shrink-0" />
                  ) : (
                    <Medal className="w-4 h-4 text-blue-600 shrink-0" />
                  )}
                  <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                    Rank #{p.dense_rank}
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-950 dark:text-white truncate">
                  {p.student_name}
                </h3>
              </div>

              <div className="text-right shrink-0">
                <div className="text-2xl font-bold font-mono tabular-nums text-blue-700 dark:text-blue-400">
                  {Number(p.score).toFixed(2)}
                </div>
                <div className="text-[11px] text-slate-400">Raw Score</div>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Clean Minimalist Leaderboard Table: Strictly Rank, Candidate Name, and Raw Score */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950 text-xs text-slate-500 dark:text-slate-400">
                <th className="py-3.5 px-6 font-medium w-28">Rank</th>
                <th className="py-3.5 px-6 font-medium">Candidate Name</th>
                <th className="py-3.5 px-6 font-medium text-right">Raw Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800 text-sm">
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  onClick={() => onSelectCandidateResult(entry.id)}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
                >
                  <td className="py-3.5 px-6 font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                    #{entry.dense_rank}
                  </td>
                  <td className="py-3.5 px-6 font-semibold text-slate-900 dark:text-white">
                    {entry.student_name}
                  </td>
                  <td className="py-3.5 px-6 text-right font-mono tabular-nums font-bold text-blue-700 dark:text-blue-400">
                    {Number(entry.score).toFixed(2)}
                  </td>
                </tr>
              ))}

              {!isLoading && entries.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-12 text-center text-sm text-slate-500">
                    No candidates match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Pagination */}
        <div className="px-6 py-3.5 bg-slate-50/80 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-4">
            <span className="font-mono tabular-nums">
              Page {page} of {totalPages}
            </span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-slate-300 text-blue-700"
              />
              <span>Auto-refresh ({refreshSeconds}s)</span>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg disabled:opacity-40 flex items-center gap-1 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev</span>
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg disabled:opacity-40 flex items-center gap-1 cursor-pointer"
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
