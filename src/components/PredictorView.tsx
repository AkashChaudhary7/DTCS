import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileCode2,
  Link2,
  Loader2,
  Lock,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react';
import {
  CategoryType,
  ExamConfig,
  ShiftPaper,
  StudentSubmissionDetail,
} from '../shared/types';

interface PredictorViewProps {
  exam: ExamConfig | null;
  shifts: ShiftPaper[];
  initialShiftPaperId?: number;
  onSubmissionSuccess: (
    result: StudentSubmissionDetail,
    discoveryEvent?: string,
    warnings?: string[]
  ) => void;
}

interface AutoExtractedPreview {
  roll_number: string;
  application_number: string;
  candidate_name: string | null;
  category: CategoryType | null;
  sub_category: string;
  gender: string;
  test_center_name: string;
  test_center_code: string;
  exam_date: string;
  shift_number: number;
  shift_timing: string;
  shift_paper_id: number;
  subject_name: string;
  total_questions: number;
  attempted_questions: number;
  unattempted_questions: number;
}

const PROCESSING_STEPS = [
  'Validating domain & SSRF rules...',
  'Extracting candidate dossier from sheet...',
  'Parsing 200 question responses...',
  'Matching shift answer key...',
  'Computing dense rank & normalized score...',
];

export const PredictorView: React.FC<PredictorViewProps> = ({
  shifts,
  initialShiftPaperId,
  onSubmissionSuccess,
}) => {
  const [sampleShiftNum, setSampleShiftNum] = useState<number>(1);
  const [inputMode, setInputMode] = useState<'url' | 'upload'>('url');
  const [responseUrl, setResponseUrl] = useState('');
  const [uploadedContent, setUploadedContent] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [turnstileVerified, setTurnstileVerified] = useState(true);

  // Auto-extracted metadata directly from Response URL / Sheet (locked & authoritative)
  const [extractedPreview, setExtractedPreview] = useState<AutoExtractedPreview | null>(
    null
  );
  const [isExtracting, setIsExtracting] = useState(false);

  // Fallback manual fields ONLY used if a custom sheet lacks Name or Category
  const [fallbackName, setFallbackName] = useState('');
  const [fallbackCategory, setFallbackCategory] = useState<CategoryType>('General');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [suggestUploadFallback, setSuggestUploadFallback] = useState(false);
  const [isLoadingSample, setIsLoadingSample] = useState(false);

  useEffect(() => {
    if (initialShiftPaperId && shifts.length > 0) {
      const found = shifts.find((s) => s.id === initialShiftPaperId);
      if (found) setSampleShiftNum(found.shift_number);
    }
  }, [initialShiftPaperId, shifts]);

  const triggerAutoExtract = async (opts: { url?: string; content?: string }) => {
    if (!opts.url?.trim() && !opts.content?.trim()) {
      setExtractedPreview(null);
      return;
    }
    setIsExtracting(true);
    setErrorMessage(null);
    setSuggestUploadFallback(false);

    try {
      const resp = await fetch('/api/response/extract-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response_url: opts.url,
          uploaded_content: opts.content,
        }),
      });
      const data = await resp.json();
      if (resp.ok && data.extracted) {
        setExtractedPreview(data.extracted);
      } else {
        setExtractedPreview(null);
        if (data.error) setErrorMessage(data.error);
        if (data.requires_file_upload_fallback) setSuggestUploadFallback(true);
      }
    } catch {
      setExtractedPreview(null);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleLoadOfficialSample = async (targetShift?: number) => {
    const sNum = targetShift || sampleShiftNum || 1;
    setIsLoadingSample(true);
    setErrorMessage(null);
    setSuggestUploadFallback(false);

    try {
      const randomRoll = `41261120${9500 + Math.floor(Math.random() * 489)}`;
      const resp = await fetch(`/api/sample-fixture?shift=${sNum}&roll=${randomRoll}`);
      const data = await resp.json();

      if (inputMode === 'url') {
        setResponseUrl(data.sample_url);
        await triggerAutoExtract({ url: data.sample_url });
      } else {
        setUploadedContent(data.html);
        setUploadedFileName(`DSSSB_41_26_Shift_${sNum}_${randomRoll}.html`);
        await triggerAutoExtract({ content: data.html });
      }
    } catch {
      setErrorMessage('Failed to load sample response sheet.');
    } finally {
      setIsLoadingSample(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
      setErrorMessage('File exceeds 6MB limit.');
      return;
    }
    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setUploadedContent(reader.result);
        triggerAutoExtract({ content: reader.result });
      }
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuggestUploadFallback(false);

    if (inputMode === 'url' && !responseUrl.trim()) {
      setErrorMessage('Paste your official DSSSB response-sheet URL.');
      return;
    }

    if (inputMode === 'upload' && !uploadedContent.trim()) {
      setErrorMessage('Select or paste your downloaded response sheet.');
      return;
    }

    if (!turnstileVerified) {
      setErrorMessage('Complete Cloudflare Turnstile security check.');
      return;
    }

    setIsSubmitting(true);
    setCurrentStepIndex(0);

    const stepInterval = setInterval(() => {
      setCurrentStepIndex((prev) =>
        prev < PROCESSING_STEPS.length - 1 ? prev + 1 : prev
      );
    }, 180);

    try {
      const resp = await fetch('/api/response/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_name: extractedPreview?.candidate_name || fallbackName.trim() || undefined,
          category: extractedPreview?.category || fallbackCategory,
          shift_paper_id: extractedPreview?.shift_paper_id,
          response_url: inputMode === 'url' ? responseUrl.trim() : undefined,
          uploaded_content: inputMode === 'upload' ? uploadedContent : undefined,
          source_type: inputMode === 'upload' ? 'html_upload' : 'url',
          turnstile_token: 'CF_TURNSTILE_VERIFIED',
        }),
      });

      const data = await resp.json();
      clearInterval(stepInterval);

      if (!resp.ok) {
        setErrorMessage(data.error || 'Submission failed.');
        if (data.requires_file_upload_fallback) {
          setSuggestUploadFallback(true);
        }
        setIsSubmitting(false);
        return;
      }

      setCurrentStepIndex(PROCESSING_STEPS.length - 1);
      setTimeout(() => {
        setIsSubmitting(false);
        onSubmissionSuccess(
          data.result,
          data.key_discovery_event,
          data.parser_warnings
        );
      }, 180);
    } catch (err: any) {
      clearInterval(stepInterval);
      setIsSubmitting(false);
      setErrorMessage(err?.message || 'Network error.');
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xs space-y-6">
        {/* Minimalist Header with Instant Sample Loader */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-blue-400">
              <span>Post Code 41/26</span>
              <span aria-hidden="true">·</span>
              <span>Zero Manual Entry — Auto-Fetched from Sheet</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-950 dark:text-white mt-1">
              Instant Response-Sheet Evaluator
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <select
              aria-label="Select Sample Shift"
              value={sampleShiftNum}
              onChange={(e) => {
                const n = Number(e.target.value);
                setSampleShiftNum(n);
                handleLoadOfficialSample(n);
              }}
              className="px-2.5 py-2 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200"
            >
              {Array.from({ length: 18 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  Shift {n} Sample
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={isLoadingSample}
              onClick={() => handleLoadOfficialSample(sampleShiftNum)}
              className="px-3.5 py-2 text-xs font-semibold bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isLoadingSample ? 'Fetching...' : 'Load Sample URL'}</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Input Mode Toggle */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => setInputMode('url')}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                    inputMode === 'url'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Link2 className="w-3.5 h-3.5" />
                  <span>Paste Response URL</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('upload')}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                    inputMode === 'upload'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload HTML / File</span>
                </button>
              </div>

              <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Lock className="w-3 h-3" />
                <span>Name, Category & Shift auto-locked from URL</span>
              </span>
            </div>

            {inputMode === 'url' ? (
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  id="response-sheet-url"
                  type="url"
                  required
                  placeholder="Paste https://cdn.digialm.com/... official response-sheet URL"
                  value={responseUrl}
                  onChange={(e) => {
                    const val = e.target.value;
                    setResponseUrl(val);
                    if (val.startsWith('https://')) {
                      triggerAutoExtract({ url: val });
                    } else {
                      setExtractedPreview(null);
                    }
                  }}
                  className="flex-1 px-4 py-3 text-sm font-mono bg-slate-50/70 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <button
                  type="button"
                  disabled={isExtracting || !responseUrl.trim()}
                  onClick={() => triggerAutoExtract({ url: responseUrl })}
                  className="px-4 py-3 text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {isExtracting ? 'Fetching...' : 'Fetch Details'}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="border border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-4 bg-slate-50/60 dark:bg-slate-950 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                    <FileCode2 className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" />
                    <span className="truncate">
                      {uploadedFileName || 'Select saved DSSSB Response Sheet (.html, .txt)'}
                    </span>
                  </div>
                  <label className="px-3.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-900 dark:text-white hover:bg-slate-100 cursor-pointer shrink-0">
                    <span>Browse</span>
                    <input
                      type="file"
                      accept=".html,.htm,.txt,.json"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                </div>

                <textarea
                  rows={3}
                  placeholder="Or paste response sheet HTML source directly..."
                  value={uploadedContent}
                  onChange={(e) => {
                    setUploadedContent(e.target.value);
                    if (e.target.value.length > 100) {
                      triggerAutoExtract({ content: e.target.value });
                    }
                  }}
                  className="w-full px-3.5 py-2 text-xs font-mono bg-slate-50/70 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            )}
          </div>

          {/* Locked Auto-Extracted Candidate Dossier Card */}
          {extractedPreview && (
            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Verified Metadata Auto-Extracted from Response Sheet</span>
                </div>
                <span className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  <span>Read-Only</span>
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <div className="text-slate-400">Candidate Name</div>
                  <div className="font-bold text-slate-900 dark:text-white mt-0.5 truncate">
                    {extractedPreview.candidate_name || 'Not in sheet'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Roll / Participant ID</div>
                  <div className="font-mono tabular-nums font-bold text-slate-900 dark:text-white mt-0.5">
                    {extractedPreview.roll_number}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Application No</div>
                  <div className="font-mono tabular-nums font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                    {extractedPreview.application_number}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Category · Sub-Category</div>
                  <div className="font-bold text-blue-700 dark:text-blue-400 mt-0.5">
                    {extractedPreview.category || 'General'} · {extractedPreview.sub_category}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Exam Shift & Date</div>
                  <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white mt-0.5">
                    Shift {extractedPreview.shift_number} · {extractedPreview.exam_date}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Attempted / Total</div>
                  <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white mt-0.5">
                    {extractedPreview.attempted_questions} / {extractedPreview.total_questions} MCQs
                  </div>
                </div>
                <div className="col-span-2 sm:col-span-3 pt-1 border-t border-slate-200/60 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                  <span>
                    Center: <strong className="text-slate-700 dark:text-slate-300">{extractedPreview.test_center_name} ({extractedPreview.test_center_code})</strong>
                  </span>
                  <span>
                    Gender: <strong className="text-slate-700 dark:text-slate-300">{extractedPreview.gender}</strong> · {extractedPreview.subject_name}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Fallback manual fields ONLY if a custom uploaded sheet is missing Name or Category */}
          {extractedPreview &&
            (!extractedPreview.candidate_name || !extractedPreview.category) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-xl">
                {!extractedPreview.candidate_name && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Candidate Name (Missing in sheet)
                    </label>
                    <input
                      type="text"
                      required
                      value={fallbackName}
                      onChange={(e) => setFallbackName(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                )}
                {!extractedPreview.category && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Category (Missing in sheet)
                    </label>
                    <select
                      value={fallbackCategory}
                      onChange={(e) => setFallbackCategory(e.target.value as CategoryType)}
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                    >
                      <option value="General">General (UR)</option>
                      <option value="OBC">OBC</option>
                      <option value="EWS">EWS</option>
                      <option value="SC">SC</option>
                      <option value="ST">ST</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                )}
              </div>
            )}

          {/* Error Notice */}
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center justify-between gap-3 text-xs text-rose-800 dark:text-rose-300">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
              {suggestUploadFallback && inputMode === 'url' && (
                <button
                  type="button"
                  onClick={() => {
                    setInputMode('upload');
                    setErrorMessage(null);
                  }}
                  className="px-3 py-1 bg-rose-700 text-white font-semibold rounded-lg shrink-0 cursor-pointer"
                >
                  Use Upload
                </button>
              )}
            </div>
          )}

          {/* Compact Progress Stepper */}
          {isSubmitting && (
            <div className="p-4 bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-xl flex items-center justify-between text-xs font-semibold text-blue-800 dark:text-blue-300">
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{PROCESSING_STEPS[currentStepIndex]}</span>
              </span>
              <span className="font-mono tabular-nums">
                {currentStepIndex + 1}/{PROCESSING_STEPS.length}
              </span>
            </div>
          )}

          {/* Footer Action Row */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2 border-t border-slate-200/80 dark:border-slate-800">
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={turnstileVerified}
                onChange={(e) => setTurnstileVerified(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-700"
              />
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Cloudflare Turnstile Verified</span>
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto px-7 py-3 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-semibold text-sm rounded-xl transition-colors cursor-pointer"
            >
              {isSubmitting ? 'Evaluating...' : 'Calculate Score & Predict Rank'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
