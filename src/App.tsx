/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { AboutView } from './components/AboutView';
import { AdminView } from './components/AdminView';
import { CutoffView } from './components/CutoffView';
import { HomeView } from './components/HomeView';
import { LeaderboardView } from './components/LeaderboardView';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PredictorView } from './components/PredictorView';
import { PWAInstallButton } from './components/PWAInstallButton';
import { ResultView } from './components/ResultView';
import {
  ExamConfig,
  LeaderboardEntry,
  ShiftPaper,
  StudentSubmissionDetail,
} from './shared/types';

type ActiveTab = 'home' | 'predictor' | 'leaderboard' | 'cutoff' | 'admin' | 'about';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [darkMode, setDarkMode] = useState<boolean>(false);

  const [exam, setExam] = useState<ExamConfig | null>(null);
  const [shifts, setShifts] = useState<ShiftPaper[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [topLeaderboard, setTopLeaderboard] = useState<LeaderboardEntry[]>([]);

  // Navigation context state
  const [preselectedShiftPaperId, setPreselectedShiftPaperId] = useState<
    number | undefined
  >(undefined);
  const [leaderboardFilterShift, setLeaderboardFilterShift] = useState<number>(0);

  // Result display state
  const [activeResult, setActiveResult] = useState<StudentSubmissionDetail | null>(
    null
  );
  const [lastDiscoveryEvent, setLastDiscoveryEvent] = useState<string | undefined>(
    undefined
  );
  const [lastParserWarnings, setLastParserWarnings] = useState<
    string[] | undefined
  >(undefined);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  const loadCoreData = useCallback(async () => {
    try {
      const [statsResp, lbResp] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/leaderboard?limit=10'),
      ]);
      if (statsResp.ok) {
        const sData = await statsResp.json();
        setStats(sData);
        setExam(sData.exam || null);
        setShifts(sData.shifts_summary || []);
        try {
          localStorage.setItem('dsssb_offline_stats_v1', JSON.stringify(sData));
        } catch {
          // ignore storage quota errors
        }
      }
      if (lbResp.ok) {
        const lbData = await lbResp.json();
        setTopLeaderboard(lbData.entries || []);
        try {
          localStorage.setItem('dsssb_offline_top_lb_v1', JSON.stringify(lbData.entries || []));
        } catch {
          // ignore storage quota errors
        }
      }
    } catch {
      // Offline fallback: restore cached core stats & top leaderboard from localStorage snapshot
      try {
        const cachedStatsRaw = localStorage.getItem('dsssb_offline_stats_v1');
        if (cachedStatsRaw) {
          const sData = JSON.parse(cachedStatsRaw);
          setStats(sData);
          setExam(sData.exam || null);
          setShifts(sData.shifts_summary || []);
        }
        const cachedLbRaw = localStorage.getItem('dsssb_offline_top_lb_v1');
        if (cachedLbRaw) {
          setTopLeaderboard(JSON.parse(cachedLbRaw));
        }
      } catch {
        // ignore parse errors
      }
    }
  }, []);

  useEffect(() => {
    loadCoreData();
  }, [loadCoreData]);

  const handleLoadResultById = async (submissionId: number) => {
    try {
      const resp = await fetch(`/api/result/${submissionId}`);
      if (resp.ok) {
        const detail = (await resp.json()) as StudentSubmissionDetail;
        setActiveResult(detail);
        setLastDiscoveryEvent(undefined);
        setLastParserWarnings(undefined);
        setActiveTab('predictor');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch {
      // ignore
    }
  };

  const handleNavigate = (
    tab: ActiveTab,
    options?: {
      shiftPaperId?: number;
      shiftNumber?: number;
      resultId?: number;
    }
  ) => {
    if (options?.resultId) {
      handleLoadResultById(options.resultId);
      return;
    }
    if (options?.shiftPaperId) {
      setPreselectedShiftPaperId(options.shiftPaperId);
    }
    if (options?.shiftNumber !== undefined) {
      setLeaderboardFilterShift(options.shiftNumber);
    } else if (tab === 'leaderboard') {
      setLeaderboardFilterShift(0);
    }
    if (tab === 'predictor' && !options?.resultId) {
      setActiveResult(null);
    }
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Title (Single text element wordmark) */}
          <a
            href="#overview"
            onClick={(e) => {
              e.preventDefault();
              handleNavigate('home');
            }}
            className="text-lg font-bold tracking-tight text-slate-950 dark:text-white whitespace-nowrap shrink-0 font-display"
          >
            DSSSB TGT CS Analytics
          </a>

          {/* Zone 2: 5 Concise Single-Line Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a
              href="#overview"
              onClick={(e) => {
                e.preventDefault();
                handleNavigate('home');
              }}
              className={`hover:text-slate-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'home'
                  ? 'text-blue-700 dark:text-blue-400 font-semibold underline underline-offset-8'
                  : ''
              }`}
            >
              Overview
            </a>
            <a
              href="#predictor"
              onClick={(e) => {
                e.preventDefault();
                handleNavigate('predictor');
              }}
              className={`hover:text-slate-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'predictor'
                  ? 'text-blue-700 dark:text-blue-400 font-semibold underline underline-offset-8'
                  : ''
              }`}
            >
              Rank Predictor
            </a>
            <a
              href="#leaderboard"
              onClick={(e) => {
                e.preventDefault();
                handleNavigate('leaderboard');
              }}
              className={`hover:text-slate-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'leaderboard'
                  ? 'text-blue-700 dark:text-blue-400 font-semibold underline underline-offset-8'
                  : ''
              }`}
            >
              Leaderboard
            </a>
            <a
              href="#cutoff"
              onClick={(e) => {
                e.preventDefault();
                handleNavigate('cutoff');
              }}
              className={`hover:text-slate-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'cutoff'
                  ? 'text-blue-700 dark:text-blue-400 font-semibold underline underline-offset-8'
                  : ''
              }`}
            >
              Cutoffs
            </a>
            <a
              href="#admin"
              onClick={(e) => {
                e.preventDefault();
                handleNavigate('admin');
              }}
              className={`hover:text-slate-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'admin'
                  ? 'text-blue-700 dark:text-blue-400 font-semibold underline underline-offset-8'
                  : ''
              }`}
            >
              Admin
            </a>
          </nav>

          {/* Zone 3: 1 Primary Action Button */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => handleNavigate('predictor')}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Check Rank
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Bar (visible only on mobile screens) */}
      <div className="md:hidden bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-2 flex items-center justify-between gap-2 overflow-x-auto">
        {(
          [
            ['home', 'Overview'],
            ['predictor', 'Predictor'],
            ['leaderboard', 'Leaderboard'],
            ['cutoff', 'Cutoffs'],
            ['admin', 'Admin'],
          ] as Array<[ActiveTab, string]>
        ).map(([tabKey, label]) => (
          <button
            key={tabKey}
            type="button"
            onClick={() => handleNavigate(tabKey)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
              activeTab === tabKey
                ? 'bg-blue-700 text-white font-semibold'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'home' && (
          <HomeView
            exam={exam}
            stats={stats}
            topLeaderboard={topLeaderboard}
            onNavigate={handleNavigate}
          />
        )}

        {activeTab === 'predictor' &&
          (activeResult ? (
            <ResultView
              result={activeResult}
              discoveryEvent={lastDiscoveryEvent}
              warnings={lastParserWarnings}
              onBackToPredictor={() => setActiveResult(null)}
              onViewLeaderboard={(opts) =>
                handleNavigate('leaderboard', {
                  shiftNumber: opts?.shiftNumber,
                })
              }
            />
          ) : (
            <PredictorView
              exam={exam}
              shifts={shifts}
              initialShiftPaperId={preselectedShiftPaperId}
              onSubmissionSuccess={(result, discoveryEvent, warnings) => {
                setActiveResult(result);
                setLastDiscoveryEvent(discoveryEvent);
                setLastParserWarnings(warnings);
                loadCoreData();
              }}
            />
          ))}

        {activeTab === 'leaderboard' && (
          <LeaderboardView
            shifts={shifts}
            initialShiftNumber={leaderboardFilterShift}
            refreshSeconds={exam?.leaderboard_refresh_seconds || 20}
            onSelectCandidateResult={(subId) => handleLoadResultById(subId)}
          />
        )}

        {activeTab === 'cutoff' && <CutoffView />}

        {activeTab === 'admin' && <AdminView onDataMutated={loadCoreData} />}

        {activeTab === 'about' && <AboutView />}
      </main>

      {/* Quiet Footer with Methodology link & Theme Switcher */}
      <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex flex-wrap items-center gap-2">
            <span>DSSSB TGT CS (Post Code 41/26)</span>
            <span aria-hidden="true">·</span>
            <span>Official Draft Key: 8 December 2026</span>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <PWAInstallButton />
            <button
              type="button"
              onClick={() => handleNavigate('about')}
              className="hover:text-slate-900 dark:hover:text-white underline-offset-4 hover:underline cursor-pointer"
            >
              Methodology & Disclaimer
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('admin')}
              className="hover:text-slate-900 dark:hover:text-white underline-offset-4 hover:underline cursor-pointer"
            >
              Admin Console
            </button>
            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              className="px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer"
            >
              {darkMode ? (
                <>
                  <Sun className="w-3.5 h-3.5" />
                  <span>Light Theme</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5" />
                  <span>Dark Theme</span>
                </>
              )}
            </button>
          </div>
        </div>
      </footer>

      <OfflineIndicator />
    </div>
  );
}
