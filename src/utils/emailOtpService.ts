export type EmailJsErrorCode =
  | 'MISSING_CONFIG'
  | 'AUTH_ERROR'
  | 'TEMPLATE_ERROR'
  | 'RATE_LIMIT'
  | 'NETWORK_ERROR'
  | 'SERVER_ERROR'
  | 'UNKNOWN_ERROR';

export interface EmailJsConfig {
  serviceId?: string;
  templateId?: string;
  publicKey?: string;
}

export interface FormattedEmailJsError {
  code: EmailJsErrorCode;
  messageAr: string;
  technicalDetails?: string;
}

/** 5 minutes OTP validity duration in milliseconds */
export const OTP_EXPIRY_MS = 5 * 60 * 1000;

/** 60 seconds cooldown between OTP send/resend requests */
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

/** Maximum failed OTP or login attempts before temporary lockout (3 attempts) */
export const MAX_AUTH_ATTEMPTS = 3;

/** Lockout duration in seconds (60 seconds = 1 minute) after exceeding MAX_AUTH_ATTEMPTS */
export const AUTH_LOCKOUT_SECONDS = 60;

/** 365 days verified session TTL in milliseconds (persists until explicit user logout) */
export const VERIFIED_SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000;

export function isEmailJsConfigured(config: EmailJsConfig): boolean {
  const serviceId = (config.serviceId || '').trim();
  const templateId = (config.templateId || '').trim();
  const publicKey = (config.publicKey || '').trim();
  return Boolean(serviceId && templateId && publicKey);
}

export function formatEmailJsError(err: unknown): FormattedEmailJsError {
  if (!err) {
    return {
      code: 'UNKNOWN_ERROR',
      messageAr: 'حدث خطأ غير متوقع أثناء الاتصال بخدمة EmailJS. يرجى المحاولة مرة أخرى.',
    };
  }

  const status =
    typeof (err as { status?: unknown })?.status === 'number'
      ? (err as { status: number }).status
      : undefined;
  const rawText =
    typeof (err as { text?: unknown })?.text === 'string'
      ? (err as { text: string }).text.trim()
      : typeof (err as { message?: unknown })?.message === 'string'
        ? (err as { message: string }).message.trim()
        : typeof err === 'string'
          ? err.trim()
          : '';

  const lowerText = rawText.toLowerCase();

  if (
    lowerText.includes('network') ||
    lowerText.includes('failed to fetch') ||
    lowerText.includes('load failed') ||
    lowerText.includes('offline') ||
    status === 0
  ) {
    return {
      code: 'NETWORK_ERROR',
      messageAr:
        'تعذر الاتصال بخدمة EmailJS بسبب مشكلة في الشبكة — يرجى التأكد من اتصالك بالإنترنت والمحاولة مرة أخرى.',
      technicalDetails: rawText || undefined,
    };
  }

  if (status === 429 || lowerText.includes('too many requests') || lowerText.includes('quota')) {
    return {
      code: 'RATE_LIMIT',
      messageAr:
        'تم تجاوز الحد المسموح لإرسال رسائل التحقق عبر EmailJS مؤقتاً — يرجى الانتظار قليلاً ثم إعادة المحاولة.',
      technicalDetails: rawText || undefined,
    };
  }

  if (
    lowerText.includes('template') ||
    (status === 400 && lowerText.includes('template_id'))
  ) {
    return {
      code: 'TEMPLATE_ERROR',
      messageAr:
        'فشل إرسال الكود عبر EmailJS: معرّف القالب (Template ID) غير صحيح أو غير موجود في حساب EmailJS.',
      technicalDetails: rawText || undefined,
    };
  }

  if (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    lowerText.includes('public key') ||
    lowerText.includes('user_id') ||
    lowerText.includes('service_id') ||
    lowerText.includes('unauthorized') ||
    lowerText.includes('forbidden')
  ) {
    return {
      code: 'AUTH_ERROR',
      messageAr:
        'فشل التحقق من بيانات خدمة EmailJS: يرجى التأكد من صحة Service ID وTemplate ID وPublic Key.',
      technicalDetails: rawText || undefined,
    };
  }

  if (status && status >= 500) {
    return {
      code: 'SERVER_ERROR',
      messageAr:
        'خادم خدمة EmailJS غير متاح حالياً — يرجى إعادة المحاولة بعد لحظات.',
      technicalDetails: rawText || undefined,
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    messageAr:
      'تعذر إرسال كود التحقق عبر خدمة EmailJS — يرجى التحقق من البريد الإلكتروني أو إعادة المحاولة.',
    technicalDetails: rawText || undefined,
  };
}

/**
 * Injection Protection (XSS & SQLi):
 * Strips HTML tags, script blocks, event handlers, dangerous protocols, and SQL injection tokens.
 */
/**
 * Converts any Eastern Arabic numerals (٠-٩) or Extended Arabic-Indic numerals (۰-۹)
 * into standard English digits (0-9).
 */
export function toEnglishDigits(raw: string): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * Checks that a student name contains Arabic letters and spaces only (no English letters or numbers).
 */
export function isArabicOnlyStudentName(raw: string): boolean {
  const trimmed = toEnglishDigits(raw || '').trim();
  if (!trimmed) return false;
  if (/[a-zA-Z0-9]/.test(trimmed)) return false;
  if (!/^[\u0600-\u06FF\s]+$/.test(trimmed)) return false;
  const arabicLetters = trimmed.match(/[\u0621-\u064A]/g) || [];
  return arabicLetters.length >= 2;
}

export function sanitizeTextInput(raw: string, maxLength: number = 160): string {
  if (typeof raw !== 'string') return '';
  const cleaned = toEnglishDigits(raw)
    // Remove <script> and <style> blocks completely
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    // Strip any remaining HTML tags
    .replace(/<\/?[a-z][^>]*>/gi, '')
    // Strip dangerous URI schemes and inline handlers
    .replace(/\b(?:javascript|vbscript|data)\s*:/gi, '')
    .replace(/\bon[a-z]+\s*=/gi, '')
    // Strip SQL injection comment/statement markers and raw angle brackets / backticks / null bytes
    .replace(/--/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/[<>`;\0]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return maxLength > 0 ? cleaned.slice(0, maxLength) : cleaned;
}

/**
 * Checks if raw input contains obvious XSS or SQL injection attack patterns.
 */
export function hasDangerousInjectionPayload(raw: string): boolean {
  if (typeof raw !== 'string' || !raw) return false;
  const pattern =
    /(<script|<\/script|javascript\s*:|vbscript\s*:|onerror\s*=|onload\s*=|onclick\s*=|\bUNION\s+SELECT\b|\bDROP\s+TABLE\b|\bINSERT\s+INTO\b|\bDELETE\s+FROM\b|'\s*OR\s+'?1'?\s*=\s*'?1)/i;
  return pattern.test(raw);
}

/**
 * Validates and sanitizes an email address.
 */
export function validateEmailInput(rawEmail: string): {
  valid: boolean;
  sanitized: string;
  errorAr?: string;
} {
  const trimmed = toEnglishDigits(rawEmail || '').trim();
  if (!trimmed) {
    return {
      valid: false,
      sanitized: '',
      errorAr: 'من فضلك اكتب حساب Gmail الأول.',
    };
  }
  if (hasDangerousInjectionPayload(trimmed) || /[<>'"`;\s]/.test(trimmed)) {
    return {
      valid: false,
      sanitized: '',
      errorAr: 'البريد الإلكتروني يحتوي على رموز غير مسموح بها.',
    };
  }
  if (trimmed.length > 120) {
    return {
      valid: false,
      sanitized: '',
      errorAr: 'البريد الإلكتروني طويل جداً.',
    };
  }
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(trimmed)) {
    return {
      valid: false,
      sanitized: '',
      errorAr: 'من فضلك اكتب حساب بريد إلكتروني صحيح.',
    };
  }
  return {
    valid: true,
    sanitized: trimmed.toLowerCase(),
  };
}

/**
 * Validates password input (non-empty, 6-128 characters, no dangerous script tags).
 */
export function validatePasswordInput(rawPassword: string): {
  valid: boolean;
  errorAr?: string;
} {
  const trimmed = toEnglishDigits(rawPassword || '').trim();
  if (!trimmed) {
    return {
      valid: false,
      errorAr: 'من فضلك اكتب باسورد الإيميل الأول.',
    };
  }
  if (trimmed.length < 6) {
    return {
      valid: false,
      errorAr: 'كلمة المرور قصيرة جداً — يجب أن تكون 6 أحرف أو أرقام على الأقل.',
    };
  }
  if (trimmed.length > 128) {
    return {
      valid: false,
      errorAr: 'كلمة المرور تتجاوز الحد الأقصى المسموح (128 حرفاً).',
    };
  }
  if (hasDangerousInjectionPayload(trimmed)) {
    return {
      valid: false,
      errorAr: 'كلمة المرور تحتوي على مدخلات غير صالحة.',
    };
  }
  return { valid: true };
}

/**
 * Normalizes a user-typed room input (e.g., "404", "٤٠٥", "غرفة 404", "302")
 * into canonical "غرفة <number>" format with English digits (0-9), or returns "" if empty/invalid.
 */
export function normalizeDormRoomInput(rawRoom: string): string {
  if (!rawRoom || typeof rawRoom !== 'string') return '';
  if (hasDangerousInjectionPayload(rawRoom)) return '';

  const asciiDigits = toEnglishDigits(rawRoom);
  const cleaned = sanitizeTextInput(asciiDigits, 24).trim();
  if (!cleaned) return '';

  // Strip optional leading room words ("غرفة", "غرفه", "أوضة", "اوضة", "#")
  const withoutPrefix = cleaned
    .replace(/^(?:غرف[ةه]|أوض[ةه]|اوض[ةه]|#)\s*[:\-]?\s*/i, '')
    .trim();

  if (!withoutPrefix) return '';

  // Reject any English letters in room numbers; require English digits 0-9 (optionally followed by an Arabic letter)
  if (/[a-zA-Z]/.test(withoutPrefix)) {
    return '';
  }
  if (!/^[0-9]{1,5}(?:[\-\s]?[\u0621-\u064A]{1,4})?$/.test(withoutPrefix)) {
    return '';
  }

  const numericMatch = withoutPrefix.match(/^[0-9]+/);
  if (!numericMatch || Number(numericMatch[0]) <= 0) {
    return '';
  }

  return `غرفة ${withoutPrefix.replace(/\s+/g, ' ')}`;
}

/**
 * Validates and sanitizes Student Name (Arabic only) and user-typed Dorm Room (English digits).
 */
export function validateStudentProfileInput(
  rawName: string,
  rawRoom: string,
  validRooms?: readonly string[]
): {
  valid: boolean;
  sanitizedName: string;
  sanitizedRoom: string;
  errorAr?: string;
} {
  if (hasDangerousInjectionPayload(rawName) || hasDangerousInjectionPayload(rawRoom)) {
    return {
      valid: false,
      sanitizedName: '',
      sanitizedRoom: '',
      errorAr: 'المدخلات تحتوي على رموز أو أكواد غير مسموح بها.',
    };
  }
  const sanitizedName = sanitizeTextInput(rawName, 60);
  if (!sanitizedName) {
    return {
      valid: false,
      sanitizedName: '',
      sanitizedRoom: '',
      errorAr: 'من فضلك اكتب الاسم ثنائي باللغة العربية.',
    };
  }
  if (!isArabicOnlyStudentName(sanitizedName)) {
    return {
      valid: false,
      sanitizedName: '',
      sanitizedRoom: '',
      errorAr: 'يرجى كتابة الاسم باللغة العربية فقط.',
    };
  }
  const nameWords = sanitizedName
    .trim()
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  if (nameWords.length < 2) {
    return {
      valid: false,
      sanitizedName: '',
      sanitizedRoom: '',
      errorAr: 'من فضلك اكتب الاسم ثنائي على الأقل باللغة العربية.',
    };
  }

  const trimmedRawRoom = (rawRoom || '').trim();
  if (!trimmedRawRoom) {
    return {
      valid: false,
      sanitizedName,
      sanitizedRoom: '',
      errorAr: 'من فضلك اكتب رقم الغرفة بالأرقام الإنجليزي.',
    };
  }

  const normalizedRoom = normalizeDormRoomInput(trimmedRawRoom);
  if (!normalizedRoom) {
    return {
      valid: false,
      sanitizedName,
      sanitizedRoom: '',
      errorAr: 'من فضلك اكتب رقم الغرفة بالأرقام الإنجليزي فقط.',
    };
  }

  if (Array.isArray(validRooms) && validRooms.length > 0 && !validRooms.includes(normalizedRoom)) {
    return {
      valid: false,
      sanitizedName,
      sanitizedRoom: '',
      errorAr: 'من فضلك اكتب رقم الغرفة بالأرقام الإنجليزي فقط.',
    };
  }

  return {
    valid: true,
    sanitizedName,
    sanitizedRoom: normalizedRoom,
  };
}

/**
 * Validates a 4-digit OTP input against format, expiration (5 minutes), and expected code.
 */
export function validateOtpCodeInput(
  inputCode: string,
  expectedCode?: string,
  enforceExpectedMatch: boolean = true,
  expiresAt?: number,
  nowMs: number = Date.now()
): { valid: boolean; expired?: boolean; errorAr?: string } {
  const clean = toEnglishDigits(inputCode || '').trim();
  const cleanExpected = expectedCode ? toEnglishDigits(expectedCode).trim() : undefined;
  if (!/^\d{4}$/.test(clean)) {
    return {
      valid: false,
      errorAr: 'يرجى إدخال الـ 4 أرقام أولاً',
    };
  }

  if (typeof expiresAt === 'number' && expiresAt > 0 && nowMs > expiresAt) {
    return {
      valid: false,
      expired: true,
      errorAr:
        'انتهت صلاحية كود التحقق (5 دقائق) — يرجى الضغط على إعادة إرسال الكود للحصول على كود جديد.',
    };
  }

  if (
    enforceExpectedMatch &&
    cleanExpected &&
    /^\d{4}$/.test(cleanExpected) &&
    clean !== cleanExpected
  ) {
    return {
      valid: false,
      errorAr: 'رمز التحقق غير صحيح — يرجى إدخال الكود المكون من 4 أرقام المرسل لبريدك',
    };
  }

  return { valid: true };
}

/**
 * Rate Limiting & Brute-Force Lockout evaluator.
 */
export function evaluateAttemptRateLimit(
  failedAttempts: number,
  lockedUntilMs: number,
  nowMs: number = Date.now(),
  maxAttempts: number = MAX_AUTH_ATTEMPTS,
  lockoutSeconds: number = AUTH_LOCKOUT_SECONDS
): {
  isLocked: boolean;
  remainingSeconds: number;
  nextFailedAttempts: number;
  nextLockedUntilMs: number;
  errorAr?: string;
} {
  if (lockedUntilMs > nowMs) {
    const remainingSeconds = Math.max(1, Math.ceil((lockedUntilMs - nowMs) / 1000));
    return {
      isLocked: true,
      remainingSeconds,
      nextFailedAttempts: failedAttempts,
      nextLockedUntilMs: lockedUntilMs,
      errorAr: `تم إيقاف المحاولة مؤقتاً لمدة ${remainingSeconds} ثانية لتجاوز الحد المسموح من المحاولات الخاطئة.`,
    };
  }

  // If previous lockout expired, reset counter before counting this failed attempt
  const baseAttempts = lockedUntilMs > 0 && lockedUntilMs <= nowMs ? 0 : failedAttempts;
  const nextFailedAttempts = baseAttempts + 1;

  if (nextFailedAttempts >= maxAttempts) {
    const nextLockedUntilMs = nowMs + lockoutSeconds * 1000;
    return {
      isLocked: true,
      remainingSeconds: lockoutSeconds,
      nextFailedAttempts,
      nextLockedUntilMs,
      errorAr: `تم إدخال بيانات خاطئة ${maxAttempts} مرات — تم إيقاف المحاولة مؤقتاً لمدة ${lockoutSeconds} ثانية لحماية حسابك.`,
    };
  }

  const attemptsLeft = maxAttempts - nextFailedAttempts;
  return {
    isLocked: false,
    remainingSeconds: 0,
    nextFailedAttempts,
    nextLockedUntilMs: 0,
    errorAr: `محاولة غير صحيحة (متبقي ${attemptsLeft} محاولات قبل الإيقاف المؤقت).`,
  };
}

export interface VerifiedSessionRecord {
  email: string;
  name: string;
  room: string;
  verifiedAt: number;
  expiresAt: number;
  signature: string;
}

function computeSessionSignature(
  email: string,
  name: string,
  room: string,
  verifiedAt: number,
  expiresAt: number
): string {
  const raw = `${email.toLowerCase()}|${name}|${room}|${verifiedAt}|${expiresAt}|sakan_otp_v8_guard`;
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `sig_${(hash >>> 0).toString(16)}`;
}

/**
 * Creates a signed session object only after successful email + 4-digit OTP verification.
 */
export function createVerifiedSessionPayload(
  email: string,
  name: string,
  room: string,
  nowMs: number = Date.now()
): VerifiedSessionRecord {
  const cleanEmail = sanitizeTextInput(email, 120).toLowerCase();
  const cleanName = sanitizeTextInput(name, 60);
  const cleanRoom = normalizeDormRoomInput(room) || sanitizeTextInput(room, 16);
  const verifiedAt = nowMs;
  const expiresAt = nowMs + VERIFIED_SESSION_TTL_MS;
  const signature = computeSessionSignature(
    cleanEmail,
    cleanName,
    cleanRoom,
    verifiedAt,
    expiresAt
  );
  return {
    email: cleanEmail,
    name: cleanName,
    room: cleanRoom,
    verifiedAt,
    expiresAt,
    signature,
  };
}

/**
 * Validates that a stored session in localStorage was genuinely created after OTP verification,
 * has non-empty valid fields, has an intact signature, and has not expired.
 */
export function verifySessionPayload(
  rawPayload: unknown,
  validRooms?: readonly string[],
  nowMs: number = Date.now()
): { valid: boolean; session?: VerifiedSessionRecord } {
  if (!rawPayload || typeof rawPayload !== 'object') {
    return { valid: false };
  }
  const rec = rawPayload as Partial<VerifiedSessionRecord>;
  if (
    typeof rec.email !== 'string' ||
    typeof rec.name !== 'string' ||
    typeof rec.room !== 'string' ||
    typeof rec.verifiedAt !== 'number' ||
    typeof rec.expiresAt !== 'number' ||
    typeof rec.signature !== 'string'
  ) {
    return { valid: false };
  }

  const emailCheck = validateEmailInput(rec.email);
  const profileCheck = validateStudentProfileInput(rec.name, rec.room, validRooms);
  if (!emailCheck.valid || !profileCheck.valid) {
    return { valid: false };
  }

  if (nowMs > rec.expiresAt || rec.verifiedAt <= 0 || rec.expiresAt <= rec.verifiedAt) {
    return { valid: false };
  }

  const expectedSig = computeSessionSignature(
    emailCheck.sanitized,
    profileCheck.sanitizedName,
    profileCheck.sanitizedRoom,
    rec.verifiedAt,
    rec.expiresAt
  );

  if (rec.signature !== expectedSig) {
    return { valid: false };
  }

  return {
    valid: true,
    session: {
      email: emailCheck.sanitized,
      name: profileCheck.sanitizedName,
      room: profileCheck.sanitizedRoom,
      verifiedAt: rec.verifiedAt,
      expiresAt: rec.expiresAt,
      signature: rec.signature,
    },
  };
}

/**
 * Password Hashing (تأمين كلمة المرور):
 * Deterministically hashes a password with a per-email salt across 4,096 rounds
 * using 4 independent 32-bit mixing lanes so plain-text passwords are never stored.
 */
export function hashPassword(rawPassword: string, emailSalt: string): string {
  const cleanEmail = (emailSalt || '').trim().toLowerCase();
  const pwd = (rawPassword || '').trim();
  const saltInput = `sakan_salt_v1:${cleanEmail}`;

  let s0 = 0x811c9dc5;
  let s1 = 0x9e3779b9;
  for (let i = 0; i < saltInput.length; i++) {
    const ch = saltInput.charCodeAt(i);
    s0 = Math.imul(s0 ^ ch, 0x01000193);
    s1 = Math.imul(s1 ^ (ch + i), 0x85ebca6b);
  }
  const saltHex = `${(s0 >>> 0).toString(16).padStart(8, '0')}${(s1 >>> 0).toString(16).padStart(8, '0')}`;

  const material = `${saltHex}|${pwd}|${cleanEmail}|sakan_auth_pepper_v3`;
  let h0 = 0x6a09e667 ^ s0;
  let h1 = 0xbb67ae85 ^ s1;
  let h2 = 0x3c6ef372 ^ (s0 >>> 3);
  let h3 = 0xa54ff53a ^ (s1 >>> 5);

  for (let round = 0; round < 4096; round++) {
    for (let i = 0; i < material.length; i++) {
      const code = material.charCodeAt(i);
      h0 = Math.imul(h0 ^ (code + round), 0x01000193);
      h1 = Math.imul(h1 ^ ((h0 >>> 13) + code), 0x85ebca6b);
      h2 = Math.imul(h2 ^ ((h1 >>> 15) ^ round), 0xc2b2ae35);
      h3 = Math.imul(h3 ^ ((h2 >>> 16) + i), 0x27d4eb2f);
    }
    h0 = (h0 + h3) | 0;
    h1 = (h1 ^ h2) | 0;
  }

  const digest = [h0, h1, h2, h3]
    .map((lane) => (lane >>> 0).toString(16).padStart(8, '0'))
    .join('');

  return `sakan_hash_v1$${saltHex}$${digest}`;
}

/**
 * Verifies a plain-text password against a stored passwordHash using constant-time comparison.
 */
export function verifyPasswordHash(
  rawPassword: string,
  emailSalt: string,
  storedHash: string
): boolean {
  if (!storedHash || typeof storedHash !== 'string' || !storedHash.startsWith('sakan_hash_v1$')) {
    return false;
  }
  const computed = hashPassword(rawPassword, emailSalt);
  if (computed.length !== storedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return diff === 0;
}

export interface RegisteredStudentAccountRecord {
  email: string;
  name: string;
  room: string;
  passwordHash: string;
  createdAt: number;
  updatedAt: number;
}

