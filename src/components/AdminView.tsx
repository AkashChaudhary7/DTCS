import React, { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  FileUp,
  Flag,
  KeyRound,
  Lock,
  LogOut,
  RefreshCw,
  Save,
  Settings,
  ShieldAlert,
  Trash2,
  Users,
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
import { AnswerKeyVersion, CategoryType, ShiftPaper } from '../shared/types';
import { apiFetch } from '../services/serverlessEngine';
import {
  firestoreQuotaMetrics,
  readLiveDigestFromFirestore,
  signInAdminWithGoogle,
  signOutAdminFirebase,
  subscribeToFirebaseAuth,
  syncAdminSnapshotToFirestore,
} from '../firebase';

interface AdminViewProps {
  onDataMutated: () => void;
}

const ADMIN_CATEGORIES: CategoryType[] = [
  'General',
  'OBC',
  'EWS',
  'SC',
  'ST',
  'Other',
];

export const AdminView: React.FC<AdminViewProps> = ({ onDataMutated }) => {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem('dsssb_admin_token')
  );
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<
    'submissions' | 'dashboard' | 'keys' | 'firestore' | 'settings'
  >('submissions');
  const [firebaseUserEmail, setFirebaseUserEmail] = useState<string | null>(null);
  const [isSyncingFirestore, setIsSyncingFirestore] = useState(false);
  const [firestoreDigestPreview, setFirestoreDigestPreview] = useState<any>(null);

  const [selectedAdminCategory, setSelectedAdminCategory] =
    useState<CategoryType>('General');

  const [dashboardData, setDashboardData] = useState<any>(null);
  const [answerKeysData, setAnswerKeysData] = useState<{
    versions: AnswerKeyVersion[];
    shifts: ShiftPaper[];
  }>({ versions: [], shifts: [] });
  const [selectedVersionItems, setSelectedVersionItems] = useState<any[]>([]);
  const [inspectingVersion, setInspectingVersion] = useState<AnswerKeyVersion | null>(null);

  const [revisionQuestionId, setRevisionQuestionId] = useState('');
  const [revisionNewOption, setRevisionNewOption] = useState('1');
  const [revisionNotes, setRevisionNotes] = useState('');

  const [uploadShiftId, setUploadShiftId] = useState<number>(1);
  const [uploadRawText, setUploadRawText] = useState('');
  const [uploadNotes, setUploadNotes] = useState('');

  const [submissions, setSubmissions] = useState<any[]>([]);
  const [subSearch, setSubSearch] = useState('');
  const [subShiftFilter, setSubShiftFilter] = useState<number>(0);

  const [settingsForm, setSettingsForm] = useState<any>(null);
  const [resetConfirmPhrase, setResetConfirmPhrase] = useState('');
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const authHeaders = useCallback(
    () => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    }),
    [token]
  );

  const fetchAdminData = useCallback(async () => {
    if (!token) return;
    try {
      const [dashResp, keysResp, subsResp, setResp] = await Promise.all([
        apiFetch('/api/admin/dashboard', { headers: authHeaders() }),
        apiFetch('/api/admin/answer-keys', { headers: authHeaders() }),
        apiFetch(
          `/api/admin/submissions?category=${encodeURIComponent(selectedAdminCategory)}&search=${encodeURIComponent(subSearch)}&shift_paper_id=${subShiftFilter || ''}`,
          { headers: authHeaders() }
        ),
        apiFetch('/api/admin/settings', { headers: authHeaders() }),
      ]);

      if (dashResp.status === 401) {
        localStorage.removeItem('dsssb_admin_token');
        setToken(null);
        return;
      }

      if (dashResp.ok) setDashboardData(await dashResp.json());
      if (keysResp.ok) {
        const kd = await keysResp.json();
        setAnswerKeysData(kd);
        if (kd.shifts?.length > 0 && !uploadShiftId) {
          setUploadShiftId(kd.shifts[0].id);
        }
      }
      if (subsResp.ok) {
        const sd = await subsResp.json();
        setSubmissions(sd.submissions || []);
      }
      if (setResp.ok) {
        const st = await setResp.json();
        setSettingsForm((prev: any) => prev || st.exam);
      }
    } catch {
      // ignore transient error
    }
  }, [token, authHeaders, selectedAdminCategory, subSearch, subShiftFilter, uploadShiftId]);

  useEffect(() => {
    fetchAdminData();
  }, [fetchAdminData]);

  useEffect(() => {
    const unsub = subscribeToFirebaseAuth((u) => {
      setFirebaseUserEmail(u?.email || null);
    });
    return () => unsub();
  }, []);

  const handleSyncToFirestore = async () => {
    setStatusBanner(null);
    setIsSyncingFirestore(true);
    try {
      if (!firebaseUserEmail) {
        const user = await signInAdminWithGoogle();
        setFirebaseUserEmail(user.email || null);
      }
      const res = await syncAdminSnapshotToFirestore({
        dashboardData,
        shifts: answerKeysData.shifts || [],
        submissions,
      });
      const digest = await readLiveDigestFromFirestore();
      setFirestoreDigestPreview(digest);
      setStatusBanner({
        type: 'success',
        text: `Synced ${res.documentsWritten} documents to Cloud Firestore in 1 atomic batch (${new Date(res.syncedAt).toLocaleTimeString()}).`,
      });
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: `Firestore Sync Error: ${err?.message || 'Permission or auth error.'}`,
      });
    } finally {
      setIsSyncingFirestore(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    try {
      const resp = await apiFetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setLoginError(data.error || 'Login failed.');
        return;
      }
      localStorage.setItem('dsssb_admin_token', data.token);
      setToken(data.token);
    } catch {
      setLoginError('Network error during login.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('dsssb_admin_token');
    setToken(null);
  };

  const handleExportCategoryCsv = () => {
    const headers = [
      'Category_Rank',
      'Overall_Rank',
      'Roll_Number',
      'Application_No',
      'Candidate_Name',
      'Gender',
      'Category',
      'Sub_Category',
      'Shift',
      'Exam_Date',
      'Test_Center_Code',
      'Test_Center_Name',
      'Part_A_Score',
      'Part_B_Score',
      'Net_Score',
      'Accuracy_Pct',
      'Correct',
      'Incorrect',
      'Unattempted',
    ];
    const rows = submissions.map((s) =>
      [
        s.category_dense_rank,
        s.overall_dense_rank,
        s.roll_number,
        s.application_number,
        `"${(s.student_name || '').replace(/"/g, '""')}"`,
        s.gender,
        s.category,
        s.sub_category,
        `Shift ${s.shift_number}`,
        s.exam_date,
        s.test_center_code,
        `"${(s.test_center_name || '').replace(/"/g, '""')}"`,
        Number(s.section_a_score).toFixed(2),
        Number(s.section_b_score).toFixed(2),
        Number(s.score).toFixed(2),
        Number(s.accuracy).toFixed(2),
        s.correct,
        s.incorrect,
        s.unattempted,
      ].join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DSSSB_41_26_${selectedAdminCategory}_Category_Dossier.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleInspectVersion = async (ver: AnswerKeyVersion) => {
    setInspectingVersion(ver);
    const resp = await apiFetch(`/api/admin/answer-keys/${ver.id}/items`, {
      headers: authHeaders(),
    });
    if (resp.ok) {
      const data = await resp.json();
      setSelectedVersionItems(data.items || []);
      if (data.items?.length > 0) {
        setRevisionQuestionId(data.items[0].question_id);
      }
    }
  };

  const handleKeyLifecycleAction = async (
    versionId: number,
    action: 'verify' | 'publish'
  ) => {
    setStatusBanner(null);
    const resp = await apiFetch(`/api/admin/answer-keys/${action}`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        version_id: versionId,
        notes: `Admin ${action} action`,
      }),
    });
    const data = await resp.json();
    if (resp.ok) {
      setStatusBanner({
        type: 'success',
        text: `Answer key version #${versionId} marked as ${action === 'publish' ? 'Published' : 'Verified'}.`,
      });
      fetchAdminData();
      onDataMutated();
    } else {
      setStatusBanner({ type: 'error', text: data.error || 'Action failed.' });
    }
  };

  const handleReviseQuestionKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspectingVersion || !revisionQuestionId) return;
    setStatusBanner(null);

    const resp = await apiFetch('/api/admin/answer-keys/revise', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        shift_paper_id: inspectingVersion.shift_paper_id,
        updated_items: [
          {
            question_id: revisionQuestionId.trim(),
            correct_option: revisionNewOption,
            is_dropped: revisionNewOption === 'DROP',
          },
        ],
        notes:
          revisionNotes.trim() ||
          `Revised Q.${revisionQuestionId} to ${revisionNewOption}`,
        publish_immediately: true,
      }),
    });
    const data = await resp.json();
    if (resp.ok) {
      setStatusBanner({
        type: 'success',
        text: `Published Answer Key v${data.newVersion.version_number} & recalculated ${data.recalculatedSubmissionsCount} candidate(s).`,
      });
      fetchAdminData();
      onDataMutated();
      handleInspectVersion(data.newVersion);
    } else {
      setStatusBanner({ type: 'error', text: data.error || 'Revision failed.' });
    }
  };

  const handleManualUploadKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusBanner(null);
    if (!uploadRawText.trim()) return;

    let parsedItems: Array<{ question_id: string; correct_option: string }> = [];
    const trimmed = uploadRawText.trim();
    try {
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        const j = JSON.parse(trimmed);
        parsedItems = Array.isArray(j) ? j : j.items || [];
      } else {
        parsedItems = trimmed
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l && !l.toLowerCase().startsWith('question_id'))
          .map((line) => {
            const [qid, opt] = line.split(/[,;\t]/).map((s) => s.trim());
            return { question_id: qid, correct_option: opt || '1' };
          });
      }
    } catch {
      setStatusBanner({ type: 'error', text: 'Invalid CSV/JSON format.' });
      return;
    }

    const resp = await apiFetch('/api/admin/answer-keys/upload', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        shift_paper_id: uploadShiftId,
        items: parsedItems,
        notes: uploadNotes.trim() || 'Admin Key Upload',
        publish_immediately: true,
      }),
    });
    const data = await resp.json();
    if (resp.ok) {
      setStatusBanner({
        type: 'success',
        text: `Uploaded Key v${data.newVersion.version_number} & recalculated ${data.recalculatedSubmissionsCount} candidate(s).`,
      });
      setUploadRawText('');
      fetchAdminData();
      onDataMutated();
    } else {
      setStatusBanner({ type: 'error', text: data.error || 'Upload failed.' });
    }
  };

  const handleSubmissionStatusChange = async (
    id: number,
    status: 'valid' | 'flagged' | 'hidden'
  ) => {
    await apiFetch(`/api/admin/submissions/${id}/status`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ status }),
    });
    fetchAdminData();
    onDataMutated();
  };

  const handleDeleteSubmission = async (id: number) => {
    await apiFetch(`/api/admin/submissions/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    fetchAdminData();
    onDataMutated();
  };

  const handleRecalculateAll = async (shiftPaperId?: number) => {
    setStatusBanner(null);
    const resp = await apiFetch('/api/admin/submissions/recalculate', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ shift_paper_id: shiftPaperId }),
    });
    const data = await resp.json();
    if (resp.ok) {
      setStatusBanner({
        type: 'success',
        text: `Recalculated ${data.recalculated_count} candidate submission(s).`,
      });
      fetchAdminData();
      onDataMutated();
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsForm) return;
    setStatusBanner(null);
    const resp = await apiFetch('/api/admin/settings', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        ...settingsForm,
        recalculate_all: true,
      }),
    });
    const data = await resp.json();
    if (resp.ok) {
      setSettingsForm(data.exam);
      setStatusBanner({
        type: 'success',
        text: 'Settings saved & all candidate scores recalculated.',
      });
      fetchAdminData();
      onDataMutated();
    } else {
      setStatusBanner({ type: 'error', text: data.error || 'Save failed.' });
    }
  };

  const handleResetDatabase = async (reseedSampleData: boolean) => {
    setStatusBanner(null);
    const resp = await apiFetch('/api/admin/leaderboard/reset', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        confirm_phrase: resetConfirmPhrase,
        reseed_sample_data: reseedSampleData,
      }),
    });
    const data = await resp.json();
    if (resp.ok) {
      setResetConfirmPhrase('');
      setStatusBanner({
        type: 'success',
        text: reseedSampleData
          ? 'Database reset and re-seeded with 41/26 baseline data.'
          : 'All submissions cleared.',
      });
      fetchAdminData();
      onDataMutated();
    } else {
      setStatusBanner({ type: 'error', text: data.error || 'Reset rejected.' });
    }
  };

  if (!token) {
    return (
      <div className="max-w-md mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-8 space-y-6 shadow-2xs">
        <div className="space-y-1 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-400 font-semibold">
            <Lock className="w-3.5 h-3.5" />
            <span>Post Code 41/26 Admin Console</span>
          </div>
          <h1 className="text-xl font-bold text-slate-950 dark:text-white">
            Administrator Sign In
          </h1>
        </div>

        <form onSubmit={handleLogin} className="space-y-4" autoComplete="off">
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Username
            </label>
            <input
              type="text"
              required
              autoComplete="off"
              placeholder="Enter admin username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3.5 py-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Password
            </label>
            <input
              type="password"
              required
              autoComplete="new-password"
              placeholder="Enter admin password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            />
          </div>

          {loginError && (
            <div className="text-xs text-rose-700 dark:text-rose-400 font-medium">
              {loginError}
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              className="w-full px-5 py-3 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-xl cursor-pointer transition-colors"
            >
              Sign In
            </button>
          </div>
        </form>
      </div>
    );
  }

  const categoryStatsMap = new Map<string, any>();
  for (const c of dashboardData?.category_distribution || []) {
    categoryStatsMap.set(c.category, c);
  }

  return (
    <div className="space-y-6">
      {/* Admin Top Header & Module Tabs */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-blue-700 dark:text-blue-400">
              Post Code 41/26 · Full Candidate Dossier & Answer-Key Control
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-950 dark:text-white mt-0.5">
              Admin Control Center
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-x-auto max-w-full">
              <button
                type="button"
                onClick={() => setActiveTab('submissions')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'submissions'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Category-Wise Dossiers
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('dashboard')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'dashboard'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Centers & Telemetry
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('keys')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'keys'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Answer Keys (18)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('firestore')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'firestore'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Firestore DB (10k/Day)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'settings'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Settings
              </button>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="px-3 py-2 text-xs font-medium text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 rounded-xl flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Exit</span>
            </button>
          </div>
        </div>

        {statusBanner && (
          <div
            className={`p-3 rounded-xl text-xs font-medium flex items-center justify-between ${
              statusBanner.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
            }`}
          >
            <span>{statusBanner.text}</span>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="underline ml-4 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}
      </section>

      {/* TAB 1 (DEFAULT): CATEGORY-WISE FULL CANDIDATE DOSSIERS */}
      {activeTab === 'submissions' && (
        <div className="space-y-6">
          {/* Interactive Category Selector Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {ADMIN_CATEGORIES.map((cat) => {
              const st = categoryStatsMap.get(cat);
              const isSelected = selectedAdminCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedAdminCategory(cat)}
                  className={`p-4 rounded-2xl border text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-blue-700 text-white border-blue-700 shadow-xs'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-blue-500'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold">{cat}</span>
                    <span
                      className={`text-xs font-mono tabular-nums ${
                        isSelected ? 'text-blue-100' : 'text-slate-500'
                      }`}
                    >
                      n={st?.count || 0}
                    </span>
                  </div>
                  <div className="mt-2 text-xs font-mono tabular-nums">
                    <div>
                      Mean: <strong>{Number(st?.avg_score || 0).toFixed(1)}</strong>
                    </div>
                    <div className={isSelected ? 'text-blue-100' : 'text-slate-400'}>
                      Top: {Number(st?.max_score || 0).toFixed(1)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Category-Wise Full Extracted Metadata Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                  <h2 className="text-base font-bold text-slate-950 dark:text-white">
                    {selectedAdminCategory} Category — Extracted Candidate Dossiers (
                    {submissions.length})
                  </h2>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Includes Roll No, Application No, Gender, Sub-Category, Test Center, and
                  Part A / B scores fetched directly from candidate response URLs
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <input
                  type="text"
                  placeholder="Search Roll, App No, Name, Center..."
                  value={subSearch}
                  onChange={(e) => setSubSearch(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl"
                />
                <select
                  value={subShiftFilter}
                  onChange={(e) => setSubShiftFilter(Number(e.target.value))}
                  className="px-3 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl"
                >
                  <option value={0}>All 18 Shifts</option>
                  {answerKeysData.shifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      Shift {s.shift_number} ({s.exam_date})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleExportCategoryCsv}
                  className="px-3.5 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export {selectedAdminCategory} CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRecalculateAll(subShiftFilter || undefined)}
                  className="px-3.5 py-1.5 text-xs font-semibold bg-blue-700 text-white rounded-xl flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Recalculate</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                    <th className="py-2.5 pr-3">Cat Rank</th>
                    <th className="py-2.5 px-3">Roll No · App No</th>
                    <th className="py-2.5 px-3">Candidate · Gender · SubCat</th>
                    <th className="py-2.5 px-3">Shift & Date</th>
                    <th className="py-2.5 px-3">Extracted Test Center</th>
                    <th className="py-2.5 px-3 text-right">Part A / B</th>
                    <th className="py-2.5 px-3 text-right">C / W / U</th>
                    <th className="py-2.5 px-3 text-right">Net Score</th>
                    <th className="py-2.5 pl-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800 text-xs">
                  {submissions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-3 pr-3 font-mono tabular-nums">
                        <span className="font-bold text-slate-900 dark:text-white">
                          #{sub.category_dense_rank}
                        </span>
                        <span className="text-slate-400 ml-1">
                          (AIR #{sub.overall_dense_rank})
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {sub.roll_number || '—'}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          App: {sub.application_number || '—'}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {sub.student_name}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {sub.gender || '—'} · Sub: {sub.sub_category || 'None'} ·{' '}
                          <span className="font-mono">{sub.status}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          Shift {sub.shift_number}
                        </div>
                        <div className="text-[11px] text-slate-400">{sub.exam_date}</div>
                      </td>
                      <td className="py-3 px-3 max-w-[200px]">
                        <div className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                          {sub.test_center_code || 'DL01'}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {sub.test_center_name || 'iON Digital Zone'}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">
                        {Number(sub.section_a_score).toFixed(1)} /{' '}
                        {Number(sub.section_b_score).toFixed(1)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">
                        <span className="text-emerald-700 dark:text-emerald-400">
                          {sub.correct}
                        </span>
                        /
                        <span className="text-rose-700 dark:text-rose-400">
                          {sub.incorrect}
                        </span>
                        /<span className="text-slate-400">{sub.unattempted}</span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">
                        <div className="text-sm font-bold text-blue-700 dark:text-blue-400">
                          {Number(sub.score).toFixed(2)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {Number(sub.accuracy).toFixed(1)}% acc
                        </div>
                      </td>
                      <td className="py-3 pl-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {sub.status !== 'valid' && (
                            <button
                              type="button"
                              title="Restore"
                              onClick={() => handleSubmissionStatusChange(sub.id, 'valid')}
                              className="p-1 text-emerald-700 hover:bg-emerald-50 rounded cursor-pointer"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {sub.status !== 'flagged' && (
                            <button
                              type="button"
                              title="Flag"
                              onClick={() => handleSubmissionStatusChange(sub.id, 'flagged')}
                              className="p-1 text-amber-700 hover:bg-amber-50 rounded cursor-pointer"
                            >
                              <Flag className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {sub.status !== 'hidden' ? (
                            <button
                              type="button"
                              title="Hide"
                              onClick={() => handleSubmissionStatusChange(sub.id, 'hidden')}
                              className="p-1 text-slate-600 hover:bg-slate-100 rounded cursor-pointer"
                            >
                              <EyeOff className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              title="Unhide"
                              onClick={() => handleSubmissionStatusChange(sub.id, 'valid')}
                              className="p-1 text-blue-700 hover:bg-blue-50 rounded cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            title="Delete"
                            onClick={() => handleDeleteSubmission(sub.id)}
                            className="p-1 text-rose-700 hover:bg-rose-50 rounded cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {submissions.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-sm text-slate-500">
                        No submissions recorded in {selectedAdminCategory} category yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: OVERVIEW & TEST CENTER TELEMETRY */}
      {activeTab === 'dashboard' && dashboardData && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
              <div className="text-xs text-slate-500">Total Submissions</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-950 dark:text-white mt-1">
                {dashboardData.total_submissions}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
              <div className="text-xs text-slate-500">Discovered Shift Keys</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-950 dark:text-white mt-1">
                {dashboardData.shifts_with_discovered_keys} / {dashboardData.total_shifts}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
              <div className="text-xs text-slate-500">Key Conflicts / Alerts</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-rose-700 dark:text-rose-400 mt-1">
                {dashboardData.conflict_keys} / {dashboardData.parser_errors}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
              <div className="text-xs text-slate-500">Overall Sample Mean</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-blue-700 dark:text-blue-400 mt-1">
                {Number(dashboardData.average_score).toFixed(2)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Extracted Test Center Venue Distribution */}
            <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-700" />
                <h2 className="text-base font-bold text-slate-950 dark:text-white">
                  Extracted Test Center Analytics
                </h2>
              </div>
              <div className="divide-y divide-slate-200/70 dark:divide-slate-800 text-xs">
                {(dashboardData.center_distribution || []).map((c: any) => (
                  <div
                    key={c.test_center_code}
                    className="py-2.5 flex items-center justify-between gap-4"
                  >
                    <div>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">
                        {c.test_center_code}
                      </span>
                      <span className="mx-1.5 text-slate-400">·</span>
                      <span className="text-slate-600 dark:text-slate-300">
                        {c.test_center_name}
                      </span>
                    </div>
                    <div className="font-mono tabular-nums shrink-0">
                      <span className="text-slate-500">{c.count} cand.</span>
                      <span className="mx-1.5 text-slate-300">|</span>
                      <span className="font-bold text-blue-700 dark:text-blue-400">
                        {Number(c.avg_score).toFixed(1)} avg
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-950 dark:text-white">
                Shift Submissions Graph
              </h2>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={dashboardData.shift_graph || []}
                    margin={{ top: 10, right: 12, left: -16, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.35} />
                    <XAxis
                      dataKey="shift_number"
                      tickFormatter={(v) => `S${v}`}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar
                      dataKey="submissions"
                      name="Submissions"
                      fill="#1d4ed8"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ANSWER KEY MANAGEMENT */}
      {activeTab === 'keys' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-950 dark:text-white">
              Shift-Wise Answer Keys (18 Shifts)
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                    <th className="py-2.5 pr-3">Shift & Date</th>
                    <th className="py-2.5 px-3">Ver</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Questions</th>
                    <th className="py-2.5 px-3 text-right">Confirmations</th>
                    <th className="py-2.5 px-3">Notes / Conflicts</th>
                    <th className="py-2.5 pl-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {answerKeysData.versions.map((ver) => (
                    <tr key={ver.id}>
                      <td className="py-3 pr-3 font-medium text-slate-900 dark:text-white">
                        Shift {ver.shift_number} ·{' '}
                        <span className="font-mono text-slate-500">{ver.exam_date}</span>
                      </td>
                      <td className="py-3 px-3 font-mono font-bold">v{ver.version_number}</td>
                      <td className="py-3 px-3 font-medium">
                        <span
                          className={
                            ver.status === 'published'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : ver.status === 'conflict'
                              ? 'text-rose-700 dark:text-rose-400 font-bold'
                              : ver.status === 'superseded'
                              ? 'text-slate-400 line-through'
                              : 'text-amber-700 dark:text-amber-400'
                          }
                        >
                          {ver.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono">
                        {ver.discovered_questions}/{ver.total_questions}
                      </td>
                      <td className="py-3 px-3 text-right font-mono">
                        {ver.confirmation_count}
                      </td>
                      <td className="py-3 px-3 text-slate-500 max-w-xs truncate">
                        {ver.conflict_details || ver.notes || '—'}
                      </td>
                      <td className="py-3 pl-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleInspectVersion(ver)}
                            className="px-2.5 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 rounded-lg cursor-pointer"
                          >
                            Inspect / Revise
                          </button>
                          {ver.status !== 'published' && ver.status !== 'superseded' && (
                            <button
                              type="button"
                              onClick={() => handleKeyLifecycleAction(ver.id, 'publish')}
                              className="px-2.5 py-1 text-xs font-semibold bg-emerald-700 text-white rounded-lg cursor-pointer"
                            >
                              Publish
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {inspectingVersion && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-950 dark:text-white flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-blue-700" />
                  <span>
                    Shift {inspectingVersion.shift_number} Key v
                    {inspectingVersion.version_number}
                  </span>
                </h3>
                <button
                  type="button"
                  onClick={() => setInspectingVersion(null)}
                  className="text-xs text-slate-500 hover:underline cursor-pointer"
                >
                  Close
                </button>
              </div>

              <form
                onSubmit={handleReviseQuestionKey}
                className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
              >
                <div>
                  <label className="block text-xs font-semibold mb-1">Question ID</label>
                  <input
                    type="text"
                    required
                    value={revisionQuestionId}
                    onChange={(e) => setRevisionQuestionId(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">New Answer</label>
                  <select
                    value={revisionNewOption}
                    onChange={(e) => setRevisionNewOption(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                  >
                    <option value="1">Option 1</option>
                    <option value="2">Option 2</option>
                    <option value="3">Option 3</option>
                    <option value="4">Option 4</option>
                    <option value="1,2">Multi (1,2)</option>
                    <option value="DROP">DROP (Bonus)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Note</label>
                  <input
                    type="text"
                    placeholder="Objection update"
                    value={revisionNotes}
                    onChange={(e) => setRevisionNotes(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Save & Recalculate
                </button>
              </form>

              <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 max-h-60 overflow-y-auto">
                {selectedVersionItems.map((item) => (
                  <button
                    key={item.question_id}
                    type="button"
                    onClick={() => {
                      setRevisionQuestionId(item.question_id);
                      setRevisionNewOption(item.is_dropped ? 'DROP' : item.correct_option);
                    }}
                    className={`p-2 rounded-lg border text-left font-mono text-[11px] cursor-pointer ${
                      revisionQuestionId === item.question_id
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/60'
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div className="text-slate-400 truncate">Q.{item.question_id}</div>
                    <div className="font-bold">
                      {item.is_dropped ? 'DROP' : item.correct_option}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Manual Upload */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-950 dark:text-white flex items-center gap-2">
              <FileUp className="w-4 h-4 text-blue-700" />
              <span>Upload CSV / JSON Answer Key</span>
            </h3>
            <form onSubmit={handleManualUploadKey} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  value={uploadShiftId}
                  onChange={(e) => setUploadShiftId(Number(e.target.value))}
                  className="px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl"
                >
                  {answerKeysData.shifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      Shift {s.shift_number} ({s.exam_date})
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Version note"
                  value={uploadNotes}
                  onChange={(e) => setUploadNotes(e.target.value)}
                  className="px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl"
                />
              </div>
              <textarea
                rows={3}
                placeholder="question_id,correct_option (e.g. 413001,2)"
                value={uploadRawText}
                onChange={(e) => setUploadRawText(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-blue-700 text-white text-xs font-semibold rounded-xl cursor-pointer"
              >
                Upload & Recalculate
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 4: SETTINGS & RESET */}
      {activeTab === 'settings' && settingsForm && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleSaveSettings}
            className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <Settings className="w-4 h-4 text-blue-700" />
              <h2 className="text-base font-bold text-slate-950 dark:text-white">
                Exam & Marking Scheme Settings
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1">Exam Title</label>
                <input
                  type="text"
                  value={settingsForm.name || ''}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, name: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">
                  Official Draft Key Target (ISO)
                </label>
                <input
                  type="text"
                  value={settingsForm.exam_countdown_target || ''}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      exam_countdown_target: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Marks Per Correct</label>
                <input
                  type="number"
                  step="0.05"
                  value={settingsForm.marks_per_correct ?? 1}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      marks_per_correct: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Negative Penalty</label>
                <input
                  type="number"
                  step="0.05"
                  value={settingsForm.negative_marks ?? 0.25}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      negative_marks: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl"
                />
              </div>
            </div>

            <button
              type="submit"
              className="px-5 py-2.5 bg-blue-700 text-white text-xs font-semibold rounded-xl flex items-center gap-2 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Save & Recalculate All</span>
            </button>
          </form>

          <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
              <ShieldAlert className="w-4 h-4" />
              <h2 className="text-base font-bold">Reset Data</h2>
            </div>
            <input
              type="text"
              placeholder="Type RESET_DSSSB_DATA"
              value={resetConfirmPhrase}
              onChange={(e) => setResetConfirmPhrase(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl"
            />
            <button
              type="button"
              onClick={() => handleResetDatabase(true)}
              className="w-full py-2 px-3 bg-slate-800 text-white text-xs font-semibold rounded-xl cursor-pointer"
            >
              Reset & Reseed Baseline
            </button>
          </div>
        </div>
      )}

      {/* TAB 4: CLOUD FIRESTORE STORAGE & 10K/DAY FREE-TIER ENGINE */}
      {activeTab === 'firestore' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  Cloud Firestore Connected · Project: {firestoreQuotaMetrics.projectId}
                </div>
                <h2 className="text-lg font-bold text-slate-950 dark:text-white mt-0.5">
                  Ultra-Low Read/Write Storage Engine (10,000+ Daily Responses Under Free Limit)
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {firebaseUserEmail ? (
                  <button
                    type="button"
                    onClick={() => signOutAdminFirebase()}
                    className="px-3.5 py-2 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl cursor-pointer"
                  >
                    Signed in: {firebaseUserEmail} (Sign Out)
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => signInAdminWithGoogle()}
                    className="px-3.5 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl cursor-pointer"
                  >
                    Connect Admin Google Auth
                  </button>
                )}

                <button
                  type="button"
                  disabled={isSyncingFirestore}
                  onClick={handleSyncToFirestore}
                  className="px-4 py-2 text-xs font-semibold bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white rounded-xl flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isSyncingFirestore ? 'animate-spin' : ''}`}
                  />
                  <span>
                    {isSyncingFirestore
                      ? 'Syncing Batch...'
                      : 'Atomic Batch Sync to Firestore'}
                  </span>
                </button>
              </div>
            </div>

            {/* 10k/Day Free Tier Quota Budget Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1">
                <div className="text-xs text-slate-500">
                  10k Responses/Day Write Budget
                </div>
                <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                  10,018 / 20,000
                </div>
                <div className="text-[11px] text-slate-500">
                  50.1% of Free Daily Write Limit (1 doc/candidate + 18 compact shift key docs; 0 per-question sub-docs)
                </div>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1">
                <div className="text-xs text-slate-500">
                  10k Views/Day Read Budget (60s Digest Cache)
                </div>
                <div className="text-2xl font-bold font-mono tabular-nums text-blue-700 dark:text-blue-400">
                  ~1,440 / 50,000
                </div>
                <div className="text-[11px] text-slate-500">
                  2.8% of Free Daily Read Limit via /system_bundles/live_digest + edge memory cache
                </div>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1">
                <div className="text-xs text-slate-500">
                  Current Session Firestore Ops
                </div>
                <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {firestoreQuotaMetrics.sessionReads}R · {firestoreQuotaMetrics.sessionWrites}W
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  DB: {firestoreQuotaMetrics.databaseId}
                </div>
              </div>
            </div>

            {firestoreDigestPreview && (
              <div className="p-4 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 rounded-xl text-xs space-y-1">
                <div className="font-bold text-emerald-800 dark:text-emerald-300">
                  Live Firestore Digest Verified (/system_bundles/live_digest)
                </div>
                <div className="font-mono text-slate-600 dark:text-slate-300">
                  Exam: {firestoreDigestPreview.examCode} · Total Submissions:{' '}
                  {firestoreDigestPreview.totalSubmissions} · Mean Score:{' '}
                  {firestoreDigestPreview.averageScore} · Discovered Keys:{' '}
                  {firestoreDigestPreview.discoveredKeysCount}/18
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
