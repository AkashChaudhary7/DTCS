# Firestore Security Specification & Red Team Audit (DSSSB TGT CS 41/26)

## 1. Data Invariants & Low-Quota Architecture (10k+ Daily Submissions under Free Tier)

1. **Zero Blanket Reads & PII Split-Collection Isolation**:
   - Public leaderboard records live in `/submissions_public/{submissionId}` and contain strictly non-PII, category-free fields (`studentName`, `shiftNumber`, `examDate`, `score`, `sectionAScore`, `sectionBScore`, `accuracy`, `correct`, `incorrect`, `unattempted`, `createdAt`, `updatedAt`).
   - Sensitive candidate dossier fields (`category`, `subCategory`, `rollNumber`, `applicationNumber`, `gender`, `testCenterCode`, `testCenterName`) are isolated in `/submissions_private/{submissionId}` and are readable/writable **exclusively** by verified administrators (`isAdmin()`).
2. **Single-Document Aggregation for 10,000+ Daily Responses**:
   - `/system_bundles/{bundleId}` stores the aggregated exam telemetry in 1 document (`1 read` per client session instead of querying 10,000 documents).
   - `/shift_keys/{shiftKeyId}` stores all 200 question answers for a shift in a single compact document (`1 write` per shift discovery instead of 200 writes).
   - `/submissions_public/{submissionId}` stores a candidate's evaluated scorecard in `1 write` (no per-question sub-documents).
3. **Strict Key & Size Enforcement**:
   - Every string field enforces `.size() <= maxLength` matching `firebase-blueprint.json`.
   - Every path parameter enforces `isValidId(id)` (`^[a-zA-Z0-9_\-]+$`, max 128 chars) on single-document operations (`get`, `create`, `update`, `delete`).
   - Every `create` and `update` enforces server timestamps (`request.time`) and immutable `createdAt`.

---

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Payload 1 (Shadow Field Injection on PublicSubmission)**:
   `{ submissionId: "cand_1", studentName: "Aarav", ..., isAdmin: true }` -> Rejected by `data.keys().hasOnly(...)`.
2. **Payload 2 (Unverified Admin Email Spoof)**:
   Auth token with `email == "ictlabgsssaidana@gmail.com"` but `email_verified == false` attempting to read `/submissions_private/cand_1` -> Rejected by `request.auth.token.email_verified == true`.
3. **Payload 3 (Public Read of Private Category Dossier)**:
   Non-admin user attempting `get(/submissions_private/cand_1)` -> Rejected by `allow get, list: if isAdmin()`.
4. **Payload 4 (Oversized String Denial-of-Wallet on ShiftKey)**:
   `compactAnswers` string of 100KB -> Rejected by `data.compactAnswers.size() <= 4096`.
5. **Payload 5 (ID Poisoning Attack)**:
   Document ID with 500 characters or special characters (`../../admin`) -> Rejected by `isValidId(docId)`.
6. **Payload 6 (Client Timestamp Forgery on Create)**:
   `createdAt` set to past/future timestamp instead of `request.time` -> Rejected by `incoming().createdAt == request.time`.
7. **Payload 7 (Immutable Field Mutation on Update)**:
   Modifying `createdAt` or `submissionId` during `update` -> Rejected by `incoming().createdAt == existing().createdAt && incoming().submissionId == existing().submissionId`.
8. **Payload 8 (Invalid Category Enum in PrivateSubmissionDossier)**:
   `category: "SuperAdmin"` -> Rejected by `data.category in ['General', 'OBC', 'EWS', 'SC', 'ST', 'Other']`.
9. **Payload 9 (Out-of-Range Score Injection)**:
   `score: 9999` or `score: -100` -> Rejected by `data.score >= -50 && data.score <= 200`.
10. **Payload 10 (Self-Assigned Admin Privilege Escalation)**:
    Non-admin user attempting `create` on `/admins/{uid}` -> Rejected by `allow create, update, delete: if isAdmin()`.
11. **Payload 11 (Terminal State Tampering on Superseded ShiftKey)**:
    Non-admin attempting to update a `ShiftKey` whose `existing().status == 'superseded'` -> Rejected by terminal state guard.
12. **Payload 12 (Partial Update Gap with Wrong Type)**:
    Admin or user updating `score` to a string `"200"` -> Rejected because `isValidPublicSubmission(incoming())` wraps the entire `allow update` expression.

---

## 3. Red Team Audit & Conflict Report

- **Shadow Update Test**: PASS — All entities enforce strict `hasAll` + `hasOnly` key allowlists in `isValid[Entity]()` and `affectedKeys().hasOnly()` in `update`.
- **Email Spoofing Test**: PASS — `isAdmin()` mandates `request.auth.token.email_verified == true`.
- **PII Blanket Test**: PASS — `/submissions_private/{submissionId}` is strictly locked to `isAdmin()`.
- **Query Trust Test**: PASS — `list` on `/submissions_public` enforces `resource.data.score >= -50` and `/submissions_private` restricts `list` to `isAdmin()`, with zero `get()`/`exists()` inside `allow list` blocks.
