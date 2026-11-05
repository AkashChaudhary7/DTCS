import crypto from 'crypto';
import { CategoryType, ParsedQuestionResponse, ParsedResponseSheet } from '../shared/types';
import { isDroppedMarker, normalizeOption } from './scoringEngine';

const DEFAULT_ALLOWED_DOMAINS = [
  'cdn.digialm.com',
  'digialm.com',
  'cdn3.digialm.com',
  'g21.digialm.com',
  'dsssb.delhi.gov.in',
  'dsssbonline.nic.in',
];

const REALISTIC_NAMES = [
  'Aarav Sharma',
  'Priya Verma',
  'Rohan Gupta',
  'Neha Yadav',
  'Vikramaditya Singh',
  'Ananya Gautam',
  'Karan Meena',
  'Divya Joshi',
  'Siddharth Nair',
  'Pooja Choudhary',
  'Harshvardhan Tiwari',
  'Meenakshi Kumari',
  'Abhishek Patel',
  'Ritika Bansal',
  'Deepak Paswan',
  'Shruti Mishra',
  'Mayank Saini',
  'Tushar Rawat',
  'Lokesh Oram',
  'Gaurav Deshmukh',
  'Swati Kashyap',
  'Prashant Bhardwaj',
  'Komal Sonkar',
  'Nitin Dahiya',
  'Sakshi Maurya',
  'Rajat Chauhan',
  'Aditya Pratap',
  'Kavita Mehra',
  'Sौरभ Dabas',
  'Himanshu Khatri',
  'Pallavi Negi',
  'ankit Sehrawat',
];

const TEST_CENTERS = [
  { code: 'DL0101', name: 'iON Digital Zone iDZ 1 Mundka, New Delhi' },
  { code: 'DL0102', name: 'iON Digital Zone iDZ 2 Sarita Vihar, New Delhi' },
  { code: 'DL0103', name: 'iON Digital Zone iDZ Rohini Sector 22, Delhi' },
  { code: 'DL0104', name: 'iON Digital Zone iDZ Pawan Ganga, Ghevra, Delhi' },
  { code: 'DL0105', name: 'iON Digital Zone iDZ Dwarka Sector 9, New Delhi' },
  { code: 'UP0901', name: 'iON Digital Zone iDZ Sector 62, Noida' },
];

export interface UrlValidationResult {
  valid: boolean;
  sanitizedUrl?: string;
  hostname?: string;
  isInternalDemoUrl?: boolean;
  demoParams?: {
    shiftNumber: number;
    candidateRoll: string;
    profileSeed: string;
    conflictMode?: boolean;
  };
  error?: string;
}

export function normalizeCategoryFromSheet(raw?: string | null): CategoryType | undefined {
  if (!raw) return undefined;
  const u = raw.trim().toUpperCase();
  if (u.includes('UR') || u.includes('UNRESERVED') || u.includes('GEN')) return 'General';
  if (u.includes('OBC')) return 'OBC';
  if (u.includes('EWS')) return 'EWS';
  if (u.includes('SC')) return 'SC';
  if (u.includes('ST')) return 'ST';
  if (u.includes('OTHER') || u.includes('PWD') || u.includes('PWBD') || u.includes('EX')) {
    return 'Other';
  }
  return undefined;
}

export function validateResponseSheetUrl(
  rawUrl: string,
  allowedDomainsEnv?: string
): UrlValidationResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, error: 'Response-sheet URL is required.' };
  }

  const trimmed = rawUrl.trim();
  if (trimmed.length > 2048) {
    return { valid: false, error: 'URL exceeds maximum allowed length (2048 chars).' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: 'Invalid URL format. Paste a valid https:// response-sheet URL.' };
  }

  if (parsed.protocol !== 'https:') {
    return {
      valid: false,
      error: 'Only secure HTTPS response-sheet URLs are permitted.',
    };
  }

  if (parsed.username || parsed.password) {
    return {
      valid: false,
      error: 'URLs containing embedded credentials are blocked for security.',
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  const blockedPatterns = [
    /^localhost$/i,
    /^127\./,
    /^10\./,
    /^192\.168\./,
    /^169\.254\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^0\./,
    /^\[::1\]$/,
    /\.internal$/i,
    /\.local$/i,
  ];
  for (const pattern of blockedPatterns) {
    if (pattern.test(hostname)) {
      return {
        valid: false,
        error: 'SSRF Protection: Internal, loopback, and private network addresses are blocked.',
      };
    }
  }

  const allowedList = (allowedDomainsEnv ? allowedDomainsEnv.split(',') : DEFAULT_ALLOWED_DOMAINS)
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  const isAllowed = allowedList.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
  );

  if (!isAllowed) {
    return {
      valid: false,
      error: `Domain "${hostname}" is not on the approved DSSSB/Digialm allowlist (${allowedList.join(', ')}).`,
    };
  }

  const shiftMatch =
    parsed.pathname.match(/shift[-_]?(\d{1,2})/i) ||
    parsed.searchParams.get('shift')?.match(/^(\d{1,2})$/);
  const rollMatch =
    parsed.pathname.match(/cand[-_]?([a-zA-Z0-9_-]+)/i) ||
    parsed.searchParams.get('roll')?.match(/^([a-zA-Z0-9_-]+)$/);
  const isConflict = parsed.searchParams.get('conflict') === '1';

  const redactedUrl = `${parsed.origin}${parsed.pathname}`;

  if (shiftMatch && rollMatch) {
    const shiftNum = Math.min(18, Math.max(1, parseInt(shiftMatch[1], 10)));
    return {
      valid: true,
      sanitizedUrl: redactedUrl,
      hostname,
      isInternalDemoUrl: true,
      demoParams: {
        shiftNumber: shiftNum,
        candidateRoll: rollMatch[1],
        profileSeed: `${shiftNum}:${rollMatch[1]}`,
        conflictMode: isConflict,
      },
    };
  }

  return {
    valid: true,
    sanitizedUrl: redactedUrl,
    hostname,
    isInternalDemoUrl: false,
  };
}

export function getShiftDefaultDate(shiftNumber: number): string {
  const dates = [
    '2026-11-27',
    '2026-11-28',
    '2026-11-29',
    '2026-11-30',
    '2026-12-01',
    '2026-12-02',
  ];
  const dayIndex = Math.floor((shiftNumber - 1) / 3) % dates.length;
  return dates[dayIndex];
}

export function getShiftDefaultTiming(shiftNumber: number): string {
  const timings = [
    '08:30 AM - 10:30 AM',
    '12:30 PM - 02:30 PM',
    '04:30 PM - 06:30 PM',
  ];
  return timings[(shiftNumber - 1) % 3];
}

/**
 * Generates a deterministic official-format TCS iON / Digialm HTML response sheet
 * with complete candidate metadata (Roll No, Application No, Name, Category, Sub-Category,
 * Gender, Test Center, Exam Date, Shift Timing, Post Code 41/26) and 200 questions.
 */
export function generateOfficialDigialmHtmlFixture(
  shiftNumber: number,
  candidateRoll: string,
  options?: {
    examDate?: string;
    paperCode?: string;
    candidateName?: string;
    category?: CategoryType;
    gender?: string;
    subCategory?: string;
    applicationNumber?: string;
    introduceKeyConflict?: boolean;
    totalQuestions?: number;
  }
): string {
  const totalQ = options?.totalQuestions || 200;
  const examDate = options?.examDate || getShiftDefaultDate(shiftNumber);
  const shiftTiming = getShiftDefaultTiming(shiftNumber);
  const paperCode = options?.paperCode || 'TGT-CS-41/26';

  const metaHash = crypto
    .createHash('sha256')
    .update(`META:${candidateRoll}:${shiftNumber}`)
    .digest();

  const candidateName =
    options?.candidateName ||
    REALISTIC_NAMES[metaHash[0] % REALISTIC_NAMES.length];

  const categoriesPool: CategoryType[] = ['General', 'OBC', 'EWS', 'SC', 'ST'];
  const category: CategoryType =
    options?.category || categoriesPool[metaHash[1] % categoriesPool.length];

  const gender = options?.gender || (metaHash[2] % 2 === 0 ? 'Male' : 'Female');
  const subCategories = ['None', 'None', 'None', 'None', 'PwBD-OH', 'Ex-SM'];
  const subCategory =
    options?.subCategory || subCategories[metaHash[3] % subCategories.length];

  const centerObj = TEST_CENTERS[metaHash[4] % TEST_CENTERS.length];
  const applicationNumber =
    options?.applicationNumber ||
    `4126${String(1000000 + ((metaHash[5] * 256 + metaHash[6]) % 8999999))}`;

  const rowsHtml: string[] = [];

  for (let i = 1; i <= totalQ; i++) {
    const qid = `${412000 + shiftNumber * 1000 + i}`;
    const section =
      i <= 20
        ? 'Section A: General Awareness'
        : i <= 40
        ? 'Section A: General Intelligence & Reasoning'
        : i <= 60
        ? 'Section A: Arithmetical & Numerical Ability'
        : i <= 80
        ? 'Section A: Hindi Language & Comprehension'
        : i <= 100
        ? 'Section A: English Language & Comprehension'
        : 'Section B: Computer Science Domain';

    const keyHash = crypto
      .createHash('sha256')
      .update(`OFFICIAL_KEY:${paperCode}:SHIFT_${shiftNumber}:Q_${i}`)
      .digest();

    const isDropped = i === 95;
    let correctOption = String((keyHash[0] % 4) + 1);
    if (options?.introduceKeyConflict && (i === 10 || i === 25)) {
      correctOption = correctOption === '1' ? '2' : '1';
    }
    if (isDropped) {
      correctOption = 'DROP';
    }

    const candHash = crypto
      .createHash('sha256')
      .update(`CAND_RESP:${candidateRoll}:SHIFT_${shiftNumber}:Q_${i}`)
      .digest();

    const skillHash = crypto
      .createHash('sha256')
      .update(`CAND_SKILL:${candidateRoll}`)
      .digest();
    const attemptThreshold = 155 + (skillHash[0] % 80);
    const correctThreshold = 135 + (skillHash[1] % 95);

    let selectedOption = '--';
    let statusText = 'Not Answered';

    if (candHash[0] < attemptThreshold) {
      statusText = 'Answered';
      if (!isDropped && candHash[1] < correctThreshold) {
        selectedOption = correctOption;
      } else {
        const wrongChoices = ['1', '2', '3', '4'].filter((c) => c !== correctOption);
        selectedOption = wrongChoices[candHash[2] % wrongChoices.length];
      }
    }

    rowsHtml.push(`
      <div class="question-pnl" data-section="${section}">
        <table class="questionRowTbl">
          <tr>
            <td class="bold">Q.${i}</td>
            <td>Section: <span class="sec-name">${section}</span></td>
          </tr>
          <tr>
            <td class="rightAns">Correct Option : ${correctOption}</td>
          </tr>
        </table>
        <table class="menu-tbl">
          <tr><td>Question ID :</td><td class="bold">${qid}</td></tr>
          <tr><td>Status :</td><td class="bold">${statusText}</td></tr>
          <tr><td>Chosen Option :</td><td class="bold">${selectedOption}</td></tr>
        </table>
      </div>
    `);
  }

  return `<!DOCTYPE html>
<html>
<head><title>DSSSB TGT Computer Science (Post Code 41/26) Official Response Sheet</title></head>
<body>
  <div class="main-info-pnl">
    <table class="cand-info-tbl">
      <tr><td>Participant ID</td><td>${candidateRoll}</td></tr>
      <tr><td>Application No</td><td>${applicationNumber}</td></tr>
      <tr><td>Participant Name</td><td>${candidateName}</td></tr>
      <tr><td>Category</td><td>${category}</td></tr>
      <tr><td>Sub-Category</td><td>${subCategory}</td></tr>
      <tr><td>Gender</td><td>${gender}</td></tr>
      <tr><td>Test Center Name</td><td>${centerObj.name}</td></tr>
      <tr><td>Center Code</td><td>${centerObj.code}</td></tr>
      <tr><td>Test Date</td><td>${examDate}</td></tr>
      <tr><td>Test Time</td><td>Shift ${shiftNumber} (${shiftTiming})</td></tr>
      <tr><td>Subject</td><td>${paperCode} (TGT Computer Science - Post Code 41/26)</td></tr>
    </table>
  </div>
  <div class="questions-container">
    ${rowsHtml.join('\n')}
  </div>
</body>
</html>`;
}

export async function fetchResponseSheetFromUrl(
  rawUrl: string,
  allowedDomainsEnv?: string
): Promise<{
  ok: boolean;
  html?: string;
  requiresFileUploadFallback?: boolean;
  error?: string;
}> {
  const validation = validateResponseSheetUrl(rawUrl, allowedDomainsEnv);
  if (!validation.valid) {
    return { ok: false, error: validation.error };
  }

  if (validation.isInternalDemoUrl && validation.demoParams) {
    const parsedUrl = new URL(rawUrl.trim());
    const nameParam = parsedUrl.searchParams.get('name') || undefined;
    const catParam = normalizeCategoryFromSheet(parsedUrl.searchParams.get('cat'));
    const html = generateOfficialDigialmHtmlFixture(
      validation.demoParams.shiftNumber,
      validation.demoParams.candidateRoll,
      {
        candidateName: nameParam,
        category: catParam,
        introduceKeyConflict: validation.demoParams.conflictMode,
      }
    );
    return { ok: true, html };
  }

  let currentUrl = rawUrl.trim();
  const maxRedirects = 3;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    const stepValidation = validateResponseSheetUrl(currentUrl, allowedDomainsEnv);
    if (!stepValidation.valid) {
      return {
        ok: false,
        error: `Redirect blocked by SSRF security policy: ${stepValidation.error}`,
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'DSSSB-RankPredictor-Bot/1.0',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      clearTimeout(timeout);

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          return { ok: false, error: 'Remote server returned an empty redirect header.' };
        }
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          requiresFileUploadFallback: true,
          error:
            'This DSSSB URL requires an active browser login session. Please upload your saved Response Sheet HTML/PDF file directly.',
        };
      }

      if (!response.ok) {
        return {
          ok: false,
          requiresFileUploadFallback: true,
          error: `Remote DSSSB server returned HTTP ${response.status}. Please use the File Upload tab if the link expired.`,
        };
      }

      const text = await response.text();
      if (text.length > 6 * 1024 * 1024) {
        return { ok: false, error: 'Response sheet exceeds the 6MB safety limit.' };
      }

      if (
        (text.includes('Session Expired') ||
          text.includes('Login to view') ||
          text.includes('Candidate Login')) &&
        !text.includes('Question ID')
      ) {
        return {
          ok: false,
          requiresFileUploadFallback: true,
          error:
            'The URL returned a DSSSB Candidate Login screen. Please save your response sheet as HTML from your browser and upload it.',
        };
      }

      return { ok: true, html: text };
    } catch (err: any) {
      clearTimeout(timeout);
      return {
        ok: false,
        requiresFileUploadFallback: true,
        error: `Could not reach external DSSSB URL (${err?.message || 'Network timeout'}). Use File Upload or try a sample Digialm URL.`,
      };
    }
  }

  return { ok: false, error: 'Too many redirects while fetching response sheet.' };
}

function extractTableField(html: string, labelPattern: string): string | undefined {
  const regex = new RegExp(
    `(?:${labelPattern})\\s*:?\\s*<\\/td>\\s*<td[^>]*>\\s*([^<]+)`,
    'i'
  );
  const match = html.match(regex);
  if (match && match[1]) {
    const val = match[1].trim();
    if (val && val !== '--' && val !== '-') return val;
  }
  // Also try plain text / colon pattern: Label : Value
  const textRegex = new RegExp(`(?:${labelPattern})\\s*[:=-]\\s*([^\\r\\n<]+)`, 'i');
  const tMatch = html.match(textRegex);
  if (tMatch && tMatch[1]) {
    const val = tMatch[1].trim();
    if (val && val !== '--' && val !== '-') return val;
  }
  return undefined;
}

/**
 * Multi-format DSSSB Response Sheet Parser.
 * Automatically extracts all candidate & exam metadata (Roll No, Application No, Name,
 * Category, Sub-Category, Gender, Test Center, Center Code, Exam Date, Shift Number,
 * Shift Timing, Subject/Post Code) and all 200 question responses.
 */
export function parseResponseSheetContent(rawContent: string): ParsedResponseSheet {
  if (!rawContent || typeof rawContent !== 'string' || rawContent.trim().length < 20) {
    throw new Error('Response sheet content is empty or too short to parse.');
  }

  const trimmed = rawContent.trim();
  const warnings: string[] = [];

  // 1. Check if JSON format
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsedJson = JSON.parse(trimmed);
      const questionsArray = Array.isArray(parsedJson)
        ? parsedJson
        : parsedJson.questions || parsedJson.responses || [];
      if (Array.isArray(questionsArray) && questionsArray.length > 0) {
        const questions: ParsedQuestionResponse[] = questionsArray.map((q: any, idx: number) => ({
          question_id: String(q.question_id || q.questionId || q.id || idx + 1).trim(),
          section_name: String(
            q.section_name ||
              q.section ||
              (idx < 100 ? 'Section A: General Aptitude' : 'Section B: Computer Science')
          ),
          selected_option: normalizeOption(q.selected_option ?? q.chosenOption ?? q.selected),
          correct_option: isDroppedMarker(q.correct_option ?? q.correctOption ?? q.answer)
            ? 'DROP'
            : normalizeOption(q.correct_option ?? q.correctOption ?? q.answer) || '1',
          question_status: isDroppedMarker(q.correct_option ?? q.correctOption)
            ? 'Dropped'
            : normalizeOption(q.selected_option ?? q.chosenOption ?? q.selected)
            ? 'Answered'
            : 'Not Answered',
        }));

        return {
          candidate_id: String(
            parsedJson.candidate_id || parsedJson.roll_number || parsedJson.participantId || 'JSON_CAND'
          ),
          application_number: parsedJson.application_number || parsedJson.applicationNo,
          candidate_name_from_sheet: parsedJson.candidate_name || parsedJson.participantName,
          category_from_sheet: normalizeCategoryFromSheet(parsedJson.category),
          sub_category: parsedJson.sub_category || 'None',
          gender: parsedJson.gender,
          test_center_name: parsedJson.test_center_name || parsedJson.centerName,
          test_center_code: parsedJson.test_center_code || parsedJson.centerCode,
          exam_date: parsedJson.exam_date,
          shift_number: parsedJson.shift_number ? Number(parsedJson.shift_number) : undefined,
          shift_timing: parsedJson.shift_timing,
          paper_code: parsedJson.paper_code || 'TGT-CS-41/26',
          subject_name: parsedJson.subject_name || 'TGT Computer Science (Post Code 41/26)',
          questions,
          parser_mode: 'json_structured',
          is_verified_real_format: true,
          warnings,
        };
      }
    } catch {
      // Fall through to HTML/Text parsers
    }
  }

  // Extract comprehensive candidate & exam metadata from Digialm header table
  const rollNumber = extractTableField(
    rawContent,
    'Participant\\s*ID|Roll\\s*No|Roll\\s*Number|Candidate\\s*ID'
  );
  const applicationNumber = extractTableField(
    rawContent,
    'Application\\s*No|Application\\s*Number|Registration\\s*No'
  );
  const candidateName = extractTableField(
    rawContent,
    'Participant\\s*Name|Candidate\\s*Name|Student\\s*Name'
  );
  const rawCategory = extractTableField(
    rawContent,
    'Category|Community|Reservation\\s*Category'
  );
  const subCategory = extractTableField(rawContent, 'Sub-Category|Sub\\s*Category|PwBD');
  const gender = extractTableField(rawContent, 'Gender|Sex');
  const testCenterName = extractTableField(
    rawContent,
    'Test\\s*Center\\s*Name|Venue\\s*Name|Exam\\s*Center'
  );
  const testCenterCode = extractTableField(
    rawContent,
    'Center\\s*Code|Venue\\s*Code|Test\\s*Center\\s*Code'
  );
  const testDate = extractTableField(rawContent, 'Test\\s*Date|Exam\\s*Date');
  const rawTestTime = extractTableField(rawContent, 'Test\\s*Time|Exam\\s*Shift|Shift');
  const rawSubject = extractTableField(rawContent, 'Subject|Post\\s*Name|Paper');

  let shiftNumber: number | undefined;
  let shiftTiming: string | undefined;

  if (rawTestTime) {
    const sMatch = rawTestTime.match(/Shift\s*(\d{1,2})/i) || rawTestTime.match(/^(\d{1,2})$/);
    if (sMatch) {
      shiftNumber = Math.min(18, Math.max(1, parseInt(sMatch[1], 10)));
    }
    const timeMatch = rawTestTime.match(/(\d{1,2}:\d{2}\s*[AP]M\s*-\s*\d{1,2}:\d{2}\s*[AP]M)/i);
    if (timeMatch) {
      shiftTiming = timeMatch[1].trim();
    } else if (!sMatch) {
      shiftTiming = rawTestTime;
    }
  }

  // 2. Parse Official TCS iON / Digialm HTML blocks (`question-pnl`)
  const digialmBlocks = rawContent.split(/class=["']question-pnl["']/i);
  if (digialmBlocks.length > 2) {
    const questions: ParsedQuestionResponse[] = [];
    for (let i = 1; i < digialmBlocks.length; i++) {
      const block = digialmBlocks[i];
      const qidMatch = block.match(/Question\s*ID\s*:\s*<\/td>\s*<td[^>]*>\s*([A-Za-z0-9_-]+)/i);
      const chosenMatch = block.match(
        /Chosen\s*Option\s*:\s*<\/td>\s*<td[^>]*>\s*([A-Za-z0-9_,-]+)/i
      );
      const statusMatch = block.match(/Status\s*:\s*<\/td>\s*<td[^>]*>\s*([^<]+)/i);
      const sectionMatch =
        block.match(/data-section=["']([^"']+)["']/i) ||
        block.match(/class=["']sec-name["'][^>]*>\s*([^<]+)/i);

      const rightAnsMatch =
        block.match(
          /class=["'][^"']*rightAns[^"']*["'][^>]*>\s*(?:Correct\s*Option\s*:\s*)?([1-4A-Da-d]|DROP|DROPPED)/i
        ) || block.match(/Correct\s*(?:Option|Answer)\s*:\s*([1-4A-Da-d]|DROP|DROPPED)/i);

      if (qidMatch && rightAnsMatch) {
        const qid = qidMatch[1].trim();
        const rawChosen = chosenMatch ? chosenMatch[1].trim() : '--';
        const rawCorrect = rightAnsMatch[1].trim().toUpperCase();
        const isDropped = isDroppedMarker(rawCorrect);
        const normSelected = normalizeOption(rawChosen);

        questions.push({
          question_id: qid,
          section_name: sectionMatch
            ? sectionMatch[1].trim()
            : questions.length < 100
            ? 'Section A: General Aptitude'
            : 'Section B: Computer Science Domain',
          selected_option: normSelected || null,
          correct_option: isDropped ? 'DROP' : normalizeOption(rawCorrect) || '1',
          question_status: isDropped
            ? 'Dropped'
            : statusMatch && statusMatch[1].toLowerCase().includes('answered') && normSelected
            ? 'Answered'
            : normSelected
            ? 'Answered'
            : 'Not Answered',
        });
      }
    }

    if (questions.length > 0) {
      return {
        candidate_id: rollNumber || 'DIGIALM_CAND',
        application_number: applicationNumber,
        candidate_name_from_sheet: candidateName,
        category_from_sheet: normalizeCategoryFromSheet(rawCategory),
        sub_category: subCategory || 'None',
        gender: gender,
        test_center_name: testCenterName,
        test_center_code: testCenterCode,
        exam_date: testDate,
        shift_number: shiftNumber,
        shift_timing: shiftTiming,
        paper_code: 'TGT-CS-41/26',
        subject_name: rawSubject || 'TGT-CS-41/26 (TGT Computer Science)',
        questions,
        parser_mode: 'digialm_official_html',
        is_verified_real_format: true,
        warnings,
      };
    }
  }

  // 3. Parse plain text / PDF extracted text patterns
  const textRegex =
    /Question\s*ID\s*[:=-]\s*([A-Za-z0-9_-]+)[\s\S]{1,400}?(?:Chosen\s*Option|Selected\s*Option)\s*[:=-]\s*([A-Za-z0-9_,-]+)[\s\S]{1,400}?(?:Correct\s*Option|Right\s*Answer)\s*[:=-]\s*([A-Za-z0-9_,-]+)/gi;
  const textMatches = Array.from(rawContent.matchAll(textRegex));
  if (textMatches.length > 0) {
    const questions: ParsedQuestionResponse[] = textMatches.map((m, idx) => {
      const qid = m[1].trim();
      const sel = normalizeOption(m[2]);
      const corrRaw = m[3].trim();
      const dropped = isDroppedMarker(corrRaw);
      return {
        question_id: qid,
        section_name:
          idx < 100 ? 'Section A: General Aptitude' : 'Section B: Computer Science Domain',
        selected_option: sel || null,
        correct_option: dropped ? 'DROP' : normalizeOption(corrRaw) || '1',
        question_status: dropped ? 'Dropped' : sel ? 'Answered' : 'Not Answered',
      };
    });

    return {
      candidate_id: rollNumber || 'TEXT_STREAM_CAND',
      application_number: applicationNumber,
      candidate_name_from_sheet: candidateName,
      category_from_sheet: normalizeCategoryFromSheet(rawCategory),
      sub_category: subCategory || 'None',
      gender: gender,
      test_center_name: testCenterName,
      test_center_code: testCenterCode,
      exam_date: testDate,
      shift_number: shiftNumber,
      shift_timing: shiftTiming,
      paper_code: 'TGT-CS-41/26',
      subject_name: rawSubject || 'TGT-CS-41/26 (TGT Computer Science)',
      questions,
      parser_mode: 'pdf_extracted_text',
      is_verified_real_format: false,
      warnings,
    };
  }

  throw new Error(
    'Unrecognized response-sheet format. Expected official DSSSB Digialm HTML or structured response sheet.'
  );
}
