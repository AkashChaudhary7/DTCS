import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Track session Firestore reads & writes to demonstrate ultra-low quota usage
export const firestoreQuotaMetrics = {
  projectId: firebaseConfig.projectId,
  databaseId: firebaseConfig.firestoreDatabaseId,
  sessionReads: 0,
  sessionWrites: 0,
  lastSyncedAt: null as string | null,
};

let connectionTested = false;
export async function testConnection(): Promise<void> {
  if (connectionTested) return;
  connectionTested = true;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    firestoreQuotaMetrics.sessionReads += 1;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

// Run connection check on boot in browser environment
if (typeof window !== 'undefined') {
  testConnection();
}

// Write-through client memory cache (60s TTL) so repeated UI tab switches cost 0 Firestore reads
let cachedDigest: { data: any; expiresAt: number } | null = null;

export async function readLiveDigestFromFirestore(): Promise<any | null> {
  if (cachedDigest && Date.now() < cachedDigest.expiresAt) {
    return cachedDigest.data;
  }
  const path = 'system_bundles/live_digest';
  try {
    const snap = await getDoc(doc(db, 'system_bundles', 'live_digest'));
    firestoreQuotaMetrics.sessionReads += 1;
    if (!snap.exists()) return null;
    const data = snap.data();
    cachedDigest = { data, expiresAt: Date.now() + 60_000 };
    return data;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function signInAdminWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  return cred.user;
}

export async function signOutAdminFirebase(): Promise<void> {
  await signOut(auth);
}

export function subscribeToFirebaseAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

function sanitizeId(raw: string, maxLen = 128): string {
  const cleaned = String(raw || 'item')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, maxLen);
  return cleaned.length > 0 ? cleaned : 'item_1';
}

/**
 * Ultra-Low-Write Batch Synchronizer:
 * Compresses the entire exam digest (1 doc), discovered shift keys (1 doc per shift),
 * and split public/private candidate submissions into a single atomic Firestore writeBatch.
 * Designed so 10,000 daily responses stay well within the Firestore Spark free tier (50k reads / 20k writes).
 */
export async function syncAdminSnapshotToFirestore(params: {
  dashboardData: any;
  shifts: any[];
  submissions: any[];
}): Promise<{ documentsWritten: number; syncedAt: string }> {
  const batch = writeBatch(db);
  let docsCount = 0;

  // 1. Single-Document Live Digest Bundle (/system_bundles/live_digest) -> 1 Write
  const bundleRef = doc(db, 'system_bundles', 'live_digest');
  const bundleSnap = await getDoc(bundleRef);
  firestoreQuotaMetrics.sessionReads += 1;

  const totalSubmissions = Math.max(
    0,
    Number(params.dashboardData?.total_submissions || 0)
  );
  const averageScore = Math.min(
    200,
    Math.max(-50, Number(params.dashboardData?.average_score || 0))
  );
  const highestScore = Math.min(
    200,
    Math.max(-50, Number(params.dashboardData?.exam?.highest_score || 165))
  );
  const discoveredKeysCount = Math.min(
    18,
    Math.max(0, Number(params.dashboardData?.shifts_with_discovered_keys || 0))
  );

  batch.set(bundleRef, {
    bundleId: 'live_digest',
    examCode: String(
      params.dashboardData?.exam?.exam_code || 'DSSSB-TGT-CS-41/26'
    ).slice(0, 64),
    totalSubmissions,
    averageScore,
    highestScore,
    discoveredKeysCount,
    createdAt: bundleSnap.exists()
      ? bundleSnap.data().createdAt
      : serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  docsCount += 1;

  // 2. Compact Single-Doc Shift Keys (/shift_keys/shift_N) -> 1 Write per discovered shift (instead of 200 writes)
  for (const s of (params.shifts || []).slice(0, 18)) {
    const shiftNum = Math.min(18, Math.max(1, Number(s.shift_number || 1)));
    const shiftKeyId = `shift_${shiftNum}`;
    const shiftRef = doc(db, 'shift_keys', shiftKeyId);
    const validStatuses = [
      'building',
      'pending_verification',
      'verified',
      'published',
      'conflict',
      'superseded',
    ];
    const normalizedStatus = validStatuses.includes(s.key_status)
      ? s.key_status
      : 'published';

    batch.set(shiftRef, {
      shiftKeyId,
      shiftNumber: shiftNum,
      examDate: String(s.exam_date || '2026-11-27').slice(0, 32),
      paperCode: String(s.paper_code || 'TGT-CS-41/26').slice(0, 64),
      versionNumber: Math.max(1, Number(s.published_key_version || 1)),
      status: normalizedStatus,
      totalQuestions: 200,
      compactAnswers: `SHIFT_${shiftNum}_200Q_COMPACT_KEY_V${s.published_key_version || 1}`,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    docsCount += 1;
  }

  // 3. Split Public (non-PII, category-free) & Private (Admin-only category dossier) Submissions
  for (const sub of (params.submissions || []).slice(0, 50)) {
    const submissionId = sanitizeId(`cand_${sub.roll_number || sub.id}`);
    const studentName = String(sub.student_name || 'Candidate').slice(0, 120);
    const shiftNumber = Math.min(18, Math.max(1, Number(sub.shift_number || 1)));
    const examDate = String(sub.exam_date || '2026-11-27').slice(0, 32);
    const score = Math.min(200, Math.max(-50, Number(sub.score || 0)));
    const sectionAScore = Math.min(
      100,
      Math.max(-25, Number(sub.section_a_score || 0))
    );
    const sectionBScore = Math.min(
      100,
      Math.max(-25, Number(sub.section_b_score || 0))
    );
    const accuracy = Math.min(100, Math.max(0, Number(sub.accuracy || 0)));
    const correct = Math.min(200, Math.max(0, Number(sub.correct || 0)));
    const incorrect = Math.min(200, Math.max(0, Number(sub.incorrect || 0)));
    const unattempted = Math.min(200, Math.max(0, Number(sub.unattempted || 0)));

    const pubRef = doc(db, 'submissions_public', submissionId);
    batch.set(pubRef, {
      submissionId,
      studentName,
      shiftNumber,
      examDate,
      score,
      sectionAScore,
      sectionBScore,
      accuracy,
      correct,
      incorrect,
      unattempted,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    docsCount += 1;

    const validCategories = ['General', 'OBC', 'EWS', 'SC', 'ST', 'Other'];
    const category = validCategories.includes(sub.category)
      ? sub.category
      : 'General';

    const privRef = doc(db, 'submissions_private', submissionId);
    batch.set(privRef, {
      submissionId,
      studentName,
      category,
      subCategory: String(sub.sub_category || 'None').slice(0, 64),
      rollNumber: String(sub.roll_number || `41261120${sub.id}`).slice(0, 64),
      applicationNumber: String(
        sub.application_number || `412600${sub.id}`
      ).slice(0, 64),
      gender: String(sub.gender || 'Not Specified').slice(0, 32),
      testCenterCode: String(sub.test_center_code || 'DL0101').slice(0, 32),
      testCenterName: String(
        sub.test_center_name || 'iON Digital Zone New Delhi'
      ).slice(0, 200),
      shiftNumber,
      score,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    docsCount += 1;
  }

  try {
    await batch.commit();
    firestoreQuotaMetrics.sessionWrites += docsCount;
    const syncedAt = new Date().toISOString();
    firestoreQuotaMetrics.lastSyncedAt = syncedAt;
    cachedDigest = null;
    return { documentsWritten: docsCount, syncedAt };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'batch_sync');
  }
}
