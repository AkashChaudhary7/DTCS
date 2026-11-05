import React, { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';

interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'key-discovery',
    question: 'How does automatic shift-wise answer key discovery work?',
    answer:
      'When the first candidate from any of the 18 shifts submits their official DSSSB response-sheet URL, the parser extracts the 200 official correct options embedded in the sheet, validates question IDs, and caches the verified shift key. Subsequent candidates in that shift are evaluated instantaneously against the cached key.',
  },
  {
    id: 'scoring-formula',
    question: 'How are Raw Score and the 40% Sectional Gate calculated for Post Code 41/26?',
    answer:
      'Each correct answer awards +1.00 mark and each incorrect attempt deducts 0.25 marks (unattempted questions carry 0 marks). Both Section A (General Paper, 100 marks) and Section B (Computer Science, 100 marks) are tracked separately against the minimum qualifying benchmark.',
  },
  {
    id: 'privacy-leaderboard',
    question: 'Is my category or roll number visible on the public leaderboard?',
    answer:
      'No. The public leaderboard displays only Rank, Candidate Name, and Raw Score. Category metadata parsed from your response sheet is kept strictly private and used only in aggregate to compute category-wise cutoff predictions.',
  },
  {
    id: 'normalization',
    question: 'How is the Estimated Normalized Score calculated across shifts?',
    answer:
      'Estimated Normalized Score adjusts your raw marks based on your shift’s mean score relative to the overall cohort mean across all active shifts. You can compare shift difficulty variations under the Cutoffs → Normalization Insights tab.',
  },
  {
    id: 'draft-key-update',
    question: 'What happens when DSSSB releases a revised key after 8 December 2026?',
    answer:
      'When a revised or final answer key is published for a shift, the system creates a new versioned key (v2, v3) and automatically recalculates all candidate scores, dropped-question bonus marks, and live ranks.',
  },
];

export const FaqSection: React.FC = () => {
  const [openId, setOpenId] = useState<string | null>(FAQ_ITEMS[0].id);

  const toggleItem = (id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
  };

  return (
    <section
      aria-label="Frequently Asked Questions"
      className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-2xs"
    >
      <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-3.5">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-blue-700 dark:text-blue-400" />
          <h2 className="text-base font-bold text-slate-950 dark:text-white">
            Frequently Asked Questions
          </h2>
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Rank Predictor & Answer Key
        </span>
      </div>

      <div className="divide-y divide-slate-200/70 dark:divide-slate-800">
        {FAQ_ITEMS.map((item) => {
          const isOpen = openId === item.id;
          return (
            <div key={item.id} className="py-3 first:pt-1 last:pb-1">
              <button
                type="button"
                onClick={() => toggleItem(item.id)}
                aria-expanded={isOpen}
                className="w-full flex items-center justify-between gap-4 text-left py-1.5 cursor-pointer group"
              >
                <span className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors">
                  {item.question}
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                    isOpen ? 'rotate-180 text-blue-700 dark:text-blue-400' : ''
                  }`}
                />
              </button>
              {isOpen && (
                <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed pr-6">
                  {item.answer}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
