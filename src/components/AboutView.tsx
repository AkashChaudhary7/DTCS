import React from 'react';
import { Database, Lock, Scale, ShieldAlert } from 'lucide-react';

export const AboutView: React.FC = () => {
  return (
    <div className="max-w-3xl mx-auto">
      <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xs">
        <div className="border-b border-slate-200/80 dark:border-slate-800 pb-4">
          <div className="text-xs font-semibold text-blue-700 dark:text-blue-400">
            Post Code 41/26 · Official Draft Key: 8 December 2026
          </div>
          <h1 className="text-2xl font-bold text-slate-950 dark:text-white mt-1">
            Methodology & Privacy
          </h1>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 bg-slate-50/70 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 rounded-xl space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <ShieldAlert className="w-4 h-4 text-blue-700 dark:text-blue-400" />
              <span>Unofficial Evaluation</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Independent rank and cutoff predictor based on candidate submissions. Final
              DSSSB results apply official statistical normalization across shifts.
            </p>
          </div>

          <div className="p-4 bg-slate-50/70 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 rounded-xl space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <Database className="w-4 h-4 text-blue-700 dark:text-blue-400" />
              <span>Smart Key Discovery</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              The first valid sheet in any of the 18 shifts extracts and caches the 200-question
              key; subsequent sheets cross-verify or flag conflicts.
            </p>
          </div>

          <div className="p-4 bg-slate-50/70 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 rounded-xl space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <Lock className="w-4 h-4 text-blue-700 dark:text-blue-400" />
              <span>Zero Credential Storage</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              We never ask for DSSSB passwords or cookies, and raw response URLs are never
              stored in the database.
            </p>
          </div>

          <div className="p-4 bg-slate-50/70 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 rounded-xl space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <Scale className="w-4 h-4 text-blue-700 dark:text-blue-400" />
              <span>SQL Dense Ranking</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Candidates with identical net scores receive the exact same rank via{' '}
              <span className="font-mono">DENSE_RANK()</span>.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
