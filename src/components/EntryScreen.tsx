import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import emailjs from '@emailjs/browser';
import { DORM_ROOMS, type DormRoom } from '../types/orders';
import type { AppEdition } from './TopBar';
import { OtpVerificationCardDemo } from './InteractiveShowcase';
import {
  SAVED_STUDENT_NAME_KEY,
  SAVED_STUDENT_ROOM_KEY,
  SAVED_STUDENT_EMAIL_KEY,
} from './OrderFormCard';
import {
  isEmailJsConfigured,
  formatEmailJsError,
  OTP_EXPIRY_MS,
  OTP_RESEND_COOLDOWN_SECONDS,
  MAX_AUTH_ATTEMPTS,
  sanitizeTextInput,
  normalizeDormRoomInput,
  toEnglishDigits,
  validateEmailInput,
  validatePasswordInput,
  validateStudentProfileInput,
  evaluateAttemptRateLimit,
  createVerifiedSessionPayload,
  hashPassword,
  verifyPasswordHash,
  type RegisteredStudentAccountRecord,
} from '../utils/emailOtpService';

export const REGISTERED_ACCOUNTS_KEY = 'sakan_registered_student_accounts_v4';
const LEGACY_REGISTERED_ACCOUNTS_V1 = 'sakan_registered_student_accounts_v1';
const LEGACY_REGISTERED_ACCOUNTS_V2 = 'sakan_registered_student_accounts_v2';
const LEGACY_REGISTERED_ACCOUNTS_V3 = 'sakan_registered_student_accounts_v3';
export const VERIFIED_SESSION_STORAGE_KEY = 'sakan_verified_session_v9';

// Secrets (5): Strictly load EmailJS credentials from import.meta.env only
const EMAILJS_SERVICE_ID =
  (import.meta.env.VITE_EMAILJS_SERVICE_ID as string | undefined)?.trim() || '';
const EMAILJS_TEMPLATE_ID =
  (import.meta.env.VITE_EMAILJS_TEMPLATE_ID as string | undefined)?.trim() || '';
const EMAILJS_PUBLIC_KEY =
  (import.meta.env.VITE_EMAILJS_PUBLIC_KEY as string | undefined)?.trim() || '';

interface EmailJsSendOutcome {
  ok: boolean;
  configured: boolean;
  errorAr?: string;
}

async function sendOtpViaEmailJS(
  targetEmail: string,
  otpCode: string,
  studentName?: string
): Promise<EmailJsSendOutcome> {
  const configured = isEmailJsConfigured({
    serviceId: EMAILJS_SERVICE_ID,
    templateId: EMAILJS_TEMPLATE_ID,
    publicKey: EMAILJS_PUBLIC_KEY,
  });

  if (!configured) {
    return { ok: false, configured: false };
  }

  try {
    const cleanEmail = sanitizeTextInput(targetEmail, 120);
    const cleanName = sanitizeTextInput(studentName || cleanEmail.split('@')[0], 60);
    const response = await emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID,
      {
        to_email: cleanEmail,
        email: cleanEmail,
        user_email: cleanEmail,
        to_name: cleanName,
        otp_code: otpCode,
        code: otpCode,
        passcode: otpCode,
        app_name: 'talabat el sakan — STEM EL ARISH',
        message: `رمز التحقق المكون من 4 أرقام لتأكيد حسابك في طلبات السكن (talabat el sakan) هو: ${otpCode} (صالح لمدة 5 دقائق)`,
      },
      {
        publicKey: EMAILJS_PUBLIC_KEY,
      }
    );
    if (response.status >= 200 && response.status < 300) {
      return { ok: true, configured: true };
    }
    const formatted = formatEmailJsError(response);
    return {
      ok: false,
      configured: true,
      errorAr: formatted.messageAr,
    };
  } catch (err: unknown) {
    const formatted = formatEmailJsError(err);
    return {
      ok: false,
      configured: true,
      errorAr: formatted.messageAr,
    };
  }
}

export interface StoredStudentAccount extends RegisteredStudentAccountRecord {
  room: DormRoom;
}

export function loadRegisteredAccounts(): Record<string, StoredStudentAccount> {
  if (typeof window === 'undefined') return {};
  try {
    localStorage.removeItem(LEGACY_REGISTERED_ACCOUNTS_V1);
    localStorage.removeItem(LEGACY_REGISTERED_ACCOUNTS_V2);
    localStorage.removeItem(LEGACY_REGISTERED_ACCOUNTS_V3);
    const raw = localStorage.getItem(REGISTERED_ACCOUNTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const safeMap: Record<string, StoredStudentAccount> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (v && typeof v === 'object') {
        const rec = v as Partial<StoredStudentAccount>;
        const cleanEmail = sanitizeTextInput(String(rec.email || k), 120).toLowerCase();
        const cleanName = sanitizeTextInput(String(rec.name || ''), 60);
        const cleanRoom = normalizeDormRoomInput(String(rec.room || ''));
        const passwordHash = typeof rec.passwordHash === 'string' ? rec.passwordHash : '';
        if (
          cleanEmail &&
          cleanName &&
          cleanRoom &&
          passwordHash.startsWith('sakan_hash_v1$')
        ) {
          safeMap[cleanEmail] = {
            email: cleanEmail,
            name: cleanName,
            room: cleanRoom as DormRoom,
            passwordHash,
            createdAt: typeof rec.createdAt === 'number' ? rec.createdAt : Date.now(),
            updatedAt: typeof rec.updatedAt === 'number' ? rec.updatedAt : Date.now(),
          };
        }
      }
    }
    return safeMap;
  } catch {
    return {};
  }
}

function saveRegisteredAccountsMap(map: Record<string, StoredStudentAccount>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(LEGACY_REGISTERED_ACCOUNTS_V1);
    localStorage.removeItem(LEGACY_REGISTERED_ACCOUNTS_V2);
    localStorage.setItem(REGISTERED_ACCOUNTS_KEY, JSON.stringify(map));
  } catch {
    // ignore storage quota errors
  }
}

function hasAnyRegisteredAccount(): boolean {
  const accounts = loadRegisteredAccounts();
  return Object.keys(accounts).length > 0;
}

function persistActiveStudentSessionToLocalStorage(account: StoredStudentAccount): void {
  if (typeof window === 'undefined') return;
  try {
    const cleanName = sanitizeTextInput(account.name, 60);
    const cleanEmail = sanitizeTextInput(account.email, 120).toLowerCase();
    localStorage.setItem(SAVED_STUDENT_NAME_KEY, cleanName);
    localStorage.setItem(SAVED_STUDENT_ROOM_KEY, account.room);
    localStorage.setItem(SAVED_STUDENT_EMAIL_KEY, cleanEmail);

    const map = loadRegisteredAccounts();
    map[cleanEmail] = account;
    saveRegisteredAccountsMap(map);

    const verifiedSession = createVerifiedSessionPayload(cleanEmail, cleanName, account.room);
    localStorage.setItem(VERIFIED_SESSION_STORAGE_KEY, JSON.stringify(verifiedSession));
  } catch {
    // ignore storage quota or private mode errors
  }
}

type AuthViewStep =
  | 'login'
  | 'signup'
  | 'otp-signup'
  | 'forgot-email'
  | 'otp-reset'
  | 'reset-password';

interface EntryScreenProps {
  initialName: string;
  initialRoom: DormRoom | '';
  initialEmail?: string;
  onSaveStudentProfileAndEnter: (name: string, room: DormRoom, email: string) => void;
  onEnterEdition: (edition: AppEdition) => void;
}

export const EntryScreen: React.FC<EntryScreenProps> = ({
  initialName,
  initialRoom,
  initialEmail = '',
  onSaveStudentProfileAndEnter,
  onEnterEdition,
}) => {
  // Default to 'login' if an account already exists in localStorage, otherwise 'signup'
  const [step, setStep] = useState<AuthViewStep>(() => {
    return hasAnyRegisteredAccount() ? 'login' : 'signup';
  });

  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmNewPassword, setConfirmNewPassword] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [room, setRoom] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Lamp starts OFF by default in the center; clicking it animates it upward and reveals the auth card
  const [isLampOn, setIsLampOn] = useState<boolean>(false);
  const [isSwinging, setIsSwinging] = useState<boolean>(false);

  // OTP state for Sign Up (one-time OTP) and Forgot Password (OTP recovery)
  const [sentOtpCode, setSentOtpCode] = useState<string>('');
  const [otpExpiresAt, setOtpExpiresAt] = useState<number>(0);
  const [isOtpVerifiedForReset, setIsOtpVerifiedForReset] = useState<boolean>(false);
  const [isSendingOtp, setIsSendingOtp] = useState<boolean>(false);
  const [emailServiceError, setEmailServiceError] = useState<string | null>(null);

  // Rate Limit (5): 60-second cooldown on OTP sending + max 3 failed attempts lockout for 60s
  const [sendCooldownSeconds, setSendCooldownSeconds] = useState<number>(0);
  const [authFailedAttempts, setAuthFailedAttempts] = useState<number>(0);
  const [authLockedUntilMs, setAuthLockedUntilMs] = useState<number>(0);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTick(Date.now());
      setSendCooldownSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const authLockoutSeconds =
    authLockedUntilMs > nowTick
      ? Math.max(1, Math.ceil((authLockedUntilMs - nowTick) / 1000))
      : 0;

  const playIncomingMailSound = () => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.14, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.42);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.42);
    } catch {
      // ignore audio errors
    }
  };

  const dispatchGmailVerificationMessage = async (
    targetEmail: string,
    targetName?: string
  ): Promise<string> => {
    setIsSendingOtp(true);
    setEmailServiceError(null);

    const immediateCode = String(Math.floor(1000 + Math.random() * 9000));
    const nextExpiresAt = Date.now() + OTP_EXPIRY_MS;
    setSentOtpCode(immediateCode);
    setOtpExpiresAt(nextExpiresAt);
    setSendCooldownSeconds(OTP_RESEND_COOLDOWN_SECONDS);

    try {
      const minLoadingDelay = new Promise<void>((resolve) => {
        window.setTimeout(resolve, 450);
      });

      const cleanName = sanitizeTextInput(targetName || name || targetEmail.split('@')[0], 60);
      const emailJsPromise = sendOtpViaEmailJS(targetEmail, immediateCode, cleanName);

      const backendPromise = fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: targetEmail,
          code: immediateCode,
          name: cleanName,
          room: normalizeDormRoomInput(room) || sanitizeTextInput(room, 16),
        }),
      })
        .then(async (res) => {
          if (!res.ok) return { ok: false, smtpDelivered: false };
          const data = (await res.json()) as { ok?: boolean; smtpDelivered?: boolean };
          return {
            ok: Boolean(data?.ok),
            smtpDelivered: Boolean(data?.smtpDelivered),
          };
        })
        .catch(() => ({ ok: false, smtpDelivered: false }));

      const [emailJsResult, backendResult] = await Promise.all([
        emailJsPromise,
        backendPromise,
        minLoadingDelay,
      ]);

      const deliveredViaRealEmail = emailJsResult.ok || backendResult.smtpDelivered;

      if (!deliveredViaRealEmail && emailJsResult.configured && emailJsResult.errorAr) {
        setEmailServiceError(emailJsResult.errorAr);
      } else if (!emailJsResult.ok && !backendResult.ok) {
        setEmailServiceError(
          emailJsResult.errorAr ||
            'تعذر الاتصال بخدمة البريد لإرسال كود التحقق — يرجى التحقق من اتصال الإنترنت والمحاولة مرة أخرى.'
        );
      } else {
        playIncomingMailSound();
      }

      try {
        if (
          typeof window !== 'undefined' &&
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          new Notification(`📩 كود تأكيد الإيميل (${targetEmail})`, {
            body: `رمز التحقق المكون من 4 أرقام في talabat el sakan هو: ${immediateCode}`,
          });
        }
      } catch {
        // ignore notification errors
      }
    } catch {
      setEmailServiceError(
        'حدث خطأ غير متوقع أثناء إرسال كود التحقق عبر EmailJS — يرجى المحاولة مرة أخرى.'
      );
    } finally {
      setIsSendingOtp(false);
    }

    return immediateCode;
  };

  const handleToggleLamp = () => {
    setIsSwinging(true);
    setIsLampOn((prev) => !prev);
    setError(null);
    window.setTimeout(() => setIsSwinging(false), 750);
  };

  const recordFailedAttemptAndSetError = (customReasonAr: string) => {
    const now = Date.now();
    const rate = evaluateAttemptRateLimit(
      authFailedAttempts,
      authLockedUntilMs,
      now,
      MAX_AUTH_ATTEMPTS
    );
    setAuthFailedAttempts(rate.nextFailedAttempts);
    setAuthLockedUntilMs(rate.nextLockedUntilMs);
    if (rate.isLocked) {
      setError(
        `🔒 تم إيقاف المحاولة مؤقتاً لمدة ${rate.remainingSeconds} ثانية لتجاوز الحد الأقصى (${MAX_AUTH_ATTEMPTS} محاولات خاطئة).`
      );
    } else {
      const remainingTries = Math.max(1, MAX_AUTH_ATTEMPTS - rate.nextFailedAttempts);
      setError(`${customReasonAr} (متبقي ${remainingTries} محاولات قبل الإيقاف المؤقت).`);
    }
  };

  // 1. Sign Up Submit (إنشاء حساب جديد - يطلب OTP مرة واحدة فقط)
  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSendingOtp) return;
    setSuccessNotice(null);

    const now = Date.now();
    if (authLockedUntilMs > now) {
      const rem = Math.max(1, Math.ceil((authLockedUntilMs - now) / 1000));
      setError(`🔒 تم إيقاف المحاولة مؤقتاً لمدة ${rem} ثانية لتجاوز عدد المحاولات المسموح (${MAX_AUTH_ATTEMPTS} محاولات).`);
      return;
    }

    if (sendCooldownSeconds > 0 && sentOtpCode) {
      setError(`يرجى الانتظار ${sendCooldownSeconds} ثانية قبل طلب إرسال كود جديد.`);
      return;
    }

    try {
      const profileCheck = validateStudentProfileInput(name, room);
      if (!profileCheck.valid) {
        setError(profileCheck.errorAr || 'من فضلك اكتب الاسم ورقم الغرفة بشكل صحيح.');
        return;
      }

      const emailCheck = validateEmailInput(email);
      if (!emailCheck.valid) {
        setError(emailCheck.errorAr || 'يرجى إدخال بريد Gmail صحيح.');
        return;
      }

      const passCheck = validatePasswordInput(password);
      if (!passCheck.valid) {
        setError(passCheck.errorAr || 'يرجى إدخال كلمة مرور قوية (6 أحرف أو أرقام على الأقل).');
        return;
      }

      const accounts = loadRegisteredAccounts();
      if (accounts[emailCheck.sanitized]) {
        setError('هذا البريد الإلكتروني مسجل مسبقاً — يرجى تسجيل الدخول أو الضغط على "نسيت كلمة المرور؟".');
        return;
      }

      setError(null);
      await dispatchGmailVerificationMessage(emailCheck.sanitized, profileCheck.sanitizedName);
      setStep('otp-signup');
    } catch {
      setError('حدث خطأ غير متوقع أثناء بدء إنشاء الحساب — يرجى المحاولة مرة أخرى.');
    }
  };

  // Complete Sign Up immediately after 4-digit OTP is verified
  const finalizeSignUpAfterOtp = () => {
    try {
      const emailCheck = validateEmailInput(email);
      const profileCheck = validateStudentProfileInput(name, room);

      if (!emailCheck.valid || !profileCheck.valid) {
        setError(profileCheck.errorAr || 'بيانات الحساب غير مكتملة — يرجى المحاولة مرة أخرى.');
        setStep('signup');
        return;
      }

      const passwordHash = hashPassword(password, emailCheck.sanitized);
      const now = Date.now();
      const newAccount: StoredStudentAccount = {
        email: emailCheck.sanitized,
        name: profileCheck.sanitizedName,
        room: profileCheck.sanitizedRoom as DormRoom,
        passwordHash,
        createdAt: now,
        updatedAt: now,
      };

      persistActiveStudentSessionToLocalStorage(newAccount);
      setPassword('');
      setAuthFailedAttempts(0);
      setAuthLockedUntilMs(0);
      onSaveStudentProfileAndEnter(
        newAccount.name,
        newAccount.room,
        newAccount.email
      );
    } catch {
      setError('حدث خطأ أثناء حفظ الحساب الجديد — يرجى المحاولة مرة أخرى.');
    }
  };

  // 2. Login Submit (تسجيل الدخول - بدون OTP)
  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessNotice(null);

    const now = Date.now();
    if (authLockedUntilMs > now) {
      const rem = Math.max(1, Math.ceil((authLockedUntilMs - now) / 1000));
      setError(`🔒 تم إيقاف المحاولة مؤقتاً لمدة ${rem} ثانية لتجاوز عدد المحاولات المسموح (${MAX_AUTH_ATTEMPTS} محاولات).`);
      return;
    }

    try {
      const emailCheck = validateEmailInput(email);
      if (!emailCheck.valid) {
        recordFailedAttemptAndSetError(emailCheck.errorAr || 'البريد الإلكتروني غير صالح');
        return;
      }

      const passCheck = validatePasswordInput(password);
      if (!passCheck.valid) {
        recordFailedAttemptAndSetError('كلمة المرور غير صحيحة');
        return;
      }

      const accounts = loadRegisteredAccounts();
      const existingAccount = accounts[emailCheck.sanitized];
      if (!existingAccount) {
        recordFailedAttemptAndSetError(
          'هذا البريد الإلكتروني غير مسجل — يرجى إنشاء حساب جديد أولاً'
        );
        return;
      }

      const isPasswordMatch = verifyPasswordHash(
        password,
        emailCheck.sanitized,
        existingAccount.passwordHash
      );
      if (!isPasswordMatch) {
        recordFailedAttemptAndSetError('كلمة المرور غير صحيحة');
        return;
      }

      // Valid Login (No OTP required!) -> Persist active session & enter immediately
      setError(null);
      setAuthFailedAttempts(0);
      setAuthLockedUntilMs(0);
      setPassword('');
      persistActiveStudentSessionToLocalStorage(existingAccount);
      onSaveStudentProfileAndEnter(
        existingAccount.name,
        existingAccount.room,
        existingAccount.email
      );
    } catch {
      setError('حدث خطأ أثناء تسجيل الدخول — يرجى المحاولة مرة أخرى.');
    }
  };

  // 3A. Forgot Password Step 1: Request OTP for registered email
  const handleForgotPasswordRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSendingOtp) return;
    setSuccessNotice(null);

    const now = Date.now();
    if (authLockedUntilMs > now) {
      const rem = Math.max(1, Math.ceil((authLockedUntilMs - now) / 1000));
      setError(`🔒 تم إيقاف المحاولة مؤقتاً لمدة ${rem} ثانية لتجاوز عدد المحاولات المسموح (${MAX_AUTH_ATTEMPTS} محاولات).`);
      return;
    }

    if (sendCooldownSeconds > 0 && sentOtpCode) {
      setError(`يرجى الانتظار ${sendCooldownSeconds} ثانية قبل طلب إرسال كود جديد.`);
      return;
    }

    try {
      const emailCheck = validateEmailInput(email);
      if (!emailCheck.valid) {
        setError(emailCheck.errorAr || 'يرجى إدخال بريد Gmail صحيح.');
        return;
      }

      const accounts = loadRegisteredAccounts();
      const existingAccount = accounts[emailCheck.sanitized];
      if (!existingAccount) {
        recordFailedAttemptAndSetError(
          'هذا البريد الإلكتروني غير مسجل لدينا — يرجى التأكد من الإيميل أو إنشاء حساب جديد'
        );
        return;
      }

      setError(null);
      setIsOtpVerifiedForReset(false);
      await dispatchGmailVerificationMessage(emailCheck.sanitized, existingAccount.name);
      setStep('otp-reset');
    } catch {
      setError('تعذر إرسال كود استرجاع الحساب — يرجى المحاولة مرة أخرى.');
    }
  };

  // 3B. Forgot Password Step 3: Save New Password after OTP verification -> Redirect to Login
  const handleResetPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!isOtpVerifiedForReset || !sentOtpCode) {
        setError('يرجى التحقق من كود الـ OTP أولاً قبل تعيين كلمة مرور جديدة.');
        setStep('otp-reset');
        return;
      }

      const emailCheck = validateEmailInput(email);
      if (!emailCheck.valid) {
        setError('البريد الإلكتروني غير صالح.');
        setStep('forgot-email');
        return;
      }

      const passCheck = validatePasswordInput(newPassword);
      if (!passCheck.valid) {
        setError(passCheck.errorAr || 'يرجى إدخال كلمة مرور جديدة قوية (6 أحرف على الأقل).');
        return;
      }

      if (confirmNewPassword && confirmNewPassword.trim() !== newPassword.trim()) {
        setError('كلمتا المرور غير متطابقتين — يرجى التأكد من تطابق كلمة المرور الجديدة.');
        return;
      }

      const accounts = loadRegisteredAccounts();
      const existing = accounts[emailCheck.sanitized];
      if (!existing) {
        setError('الحساب غير موجود — يرجى إنشاء حساب جديد.');
        setStep('signup');
        return;
      }

      const updatedHash = hashPassword(newPassword, emailCheck.sanitized);
      accounts[emailCheck.sanitized] = {
        ...existing,
        passwordHash: updatedHash,
        updatedAt: Date.now(),
      };
      saveRegisteredAccountsMap(accounts);

      setNewPassword('');
      setConfirmNewPassword('');
      setPassword('');
      setIsOtpVerifiedForReset(false);
      setAuthFailedAttempts(0);
      setAuthLockedUntilMs(0);
      setError(null);
      setSuccessNotice('تم حفظ كلمة المرور الجديدة بنجاح! يمكنك الآن تسجيل الدخول.');
      setStep('login');
    } catch {
      setError('حدث خطأ أثناء حفظ كلمة المرور الجديدة — يرجى المحاولة مرة أخرى.');
    }
  };

  const particles = [
    { id: 1, left: '8%', top: '14%', size: 3.5, delay: 0, duration: 5.2 },
    { id: 2, left: '14%', top: '18%', size: 2.5, delay: 0.9, duration: 4.8 },
    { id: 3, left: '19%', top: '11%', size: 3, delay: 0.4, duration: 5.5 },
    { id: 4, left: '25%', top: '15%', size: 3, delay: 1.2, duration: 6.0 },
    { id: 5, left: '31%', top: '12%', size: 2.5, delay: 0.3, duration: 5.0 },
    { id: 6, left: '68%', top: '14%', size: 3, delay: 0.7, duration: 5.8 },
    { id: 7, left: '74%', top: '11%', size: 2.5, delay: 1.5, duration: 5.1 },
    { id: 8, left: '84%', top: '19%', size: 3.5, delay: 0.5, duration: 5.4 },
    { id: 9, left: '12%', top: '44%', size: 2.5, delay: 1.1, duration: 6.2 },
    { id: 10, left: '86%', top: '49%', size: 3.5, delay: 0.2, duration: 4.9 },
    { id: 11, left: '92%', top: '49%', size: 3, delay: 0.8, duration: 5.6 },
  ];

  // Lamp is visually active (lit & moved to top) when isLampOn is true OR when on an active sub-step
  const isLitAndRaised = isLampOn || step === 'otp-signup' || step === 'otp-reset' || step === 'reset-password';

  const isOtpStep = step === 'otp-signup' || step === 'otp-reset';

  return (
    <div
      id="entry-screen"
      className="fixed inset-0 z-50 overflow-y-auto px-4 py-8 flex flex-col items-center justify-center transition-colors duration-700"
      style={{
        backgroundColor: isLitAndRaised ? '#09090b' : '#030407',
      }}
    >
      {/* Warm Golden Radial Glow Behind Lamp & Card */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 transition-opacity duration-700"
        style={{
          opacity: isLitAndRaised ? 1 : 0,
          background:
            'radial-gradient(circle at 50% 24%, rgba(250, 204, 21, 0.35) 0%, rgba(234, 179, 8, 0.14) 26%, rgba(9, 9, 11, 0) 62%), radial-gradient(ellipse at 50% 96%, rgba(234, 179, 8, 0.12) 0%, rgba(9, 9, 11, 0) 60%)',
        }}
      />

      {/* Floating Golden Dust Particles */}
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed inset-0 transition-opacity duration-700 ${
          isLitAndRaised ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {particles.map((p) => (
          <motion.span
            key={p.id}
            animate={{
              y: [0, -14, 0],
              opacity: isLitAndRaised ? [0.4, 0.95, 0.4] : 0,
            }}
            transition={{
              duration: p.duration,
              delay: p.delay,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            style={{
              left: p.left,
              top: p.top,
              width: p.size,
              height: p.size,
            }}
            className="absolute rounded-full bg-[#fde047] shadow-[0_0_8px_#facc15]"
          />
        ))}
      </div>

      {/* Unified Animated Container */}
      <div className="relative z-10 w-full max-w-[390px] flex flex-col items-center">
        {/* Persistent Animated Lamp that glides UP when clicked */}
        <motion.div
          animate={{
            y: isLitAndRaised ? 0 : 135,
            scale: isLitAndRaised ? 1 : 1.05,
          }}
          transition={{
            type: 'spring',
            stiffness: 105,
            damping: 16,
            mass: 0.9,
          }}
          className="flex flex-col items-center"
        >
          <motion.button
            type="button"
            onClick={handleToggleLamp}
            aria-pressed={isLitAndRaised}
            aria-label={isLitAndRaised ? 'Turn lamp off' : 'Turn lamp on'}
            animate={
              isSwinging
                ? { rotate: [0, -13, 11, -7, 4, 0] }
                : { rotate: 0 }
            }
            transition={{ duration: 0.65, ease: 'easeInOut' }}
            style={{ transformOrigin: 'top center' }}
            className="relative flex flex-col items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-2xl px-4 py-1 cursor-pointer group"
          >
            {/* Hanging Cord */}
            <motion.span
              animate={{
                height: isLitAndRaised ? 18 : 56,
                backgroundColor: isLitAndRaised ? '#fde047' : '#334155',
              }}
              transition={{ duration: 0.55, ease: 'easeInOut' }}
              className="w-0.5 block rounded-full"
            />

            {/* Soft radial golden glow behind the lamp when ON */}
            <motion.span
              aria-hidden="true"
              animate={{
                opacity: isLitAndRaised ? 1 : 0,
                scale: isLitAndRaised ? 1.15 : 0.6,
              }}
              transition={{ duration: 0.55 }}
              className="pointer-events-none absolute -inset-6 rounded-full"
              style={{
                background:
                  'radial-gradient(circle, rgba(253, 224, 71, 0.55) 0%, rgba(250, 204, 21, 0.18) 50%, transparent 75%)',
                filter: 'blur(10px)',
              }}
            />

            {/* Stylized Hanging Lamp SVG */}
            <svg
              width="76"
              height="54"
              viewBox="0 0 58 44"
              className="relative overflow-visible"
              aria-hidden="true"
            >
              {isLitAndRaised && (
                <ellipse
                  cx="29"
                  cy="34"
                  rx="24"
                  ry="10"
                  fill="rgba(250, 204, 21, 0.42)"
                  style={{ filter: 'blur(6px)' }}
                />
              )}
              <circle
                cx="29"
                cy="28"
                r="7"
                fill={isLitAndRaised ? '#fef08a' : '#334155'}
                style={{
                  filter: isLitAndRaised ? 'drop-shadow(0 0 14px #facc15)' : 'none',
                  transition: 'all 0.55s ease',
                }}
              />
              <rect
                x="23"
                y="2"
                width="12"
                height="5"
                rx="2"
                fill={isLitAndRaised ? '#f59e0b' : '#475569'}
                style={{ transition: 'all 0.55s ease' }}
              />
              <path
                d="M19 7H39L49 26C49.6 27.2 48.7 28.5 47.4 28.5H10.6C9.3 28.5 8.4 27.2 9 26L19 7Z"
                fill={isLitAndRaised ? '#fde047' : '#1e293b'}
                stroke={isLitAndRaised ? '#fef08a' : '#64748b'}
                strokeWidth="1.8"
                style={{
                  filter: isLitAndRaised
                    ? 'drop-shadow(0 0 22px rgba(250, 204, 21, 0.85))'
                    : 'none',
                  transition: 'all 0.55s ease',
                }}
              />
            </svg>
          </motion.button>

          {/* "talabat el sakan" text below the lamp when OFF */}
          <motion.p
            dir="ltr"
            onClick={handleToggleLamp}
            animate={{
              opacity: isLitAndRaised ? 0 : 1,
              y: isLitAndRaised ? -14 : 0,
              scale: isLitAndRaised ? 0.9 : 1,
            }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}
            style={{
              pointerEvents: isLitAndRaised ? 'none' : 'auto',
              height: isLitAndRaised ? 0 : 'auto',
              marginTop: isLitAndRaised ? 0 : 14,
            }}
            className="text-2xl sm:text-3xl font-black tracking-widest text-slate-300 hover:text-amber-300 transition-colors cursor-pointer select-none overflow-hidden"
          >
            talabat el sakan
          </motion.p>
        </motion.div>

        {/* Auth Card underneath the lamp */}
        <motion.div
          initial={false}
          animate={{
            opacity: isLitAndRaised ? 1 : 0,
            y: isLitAndRaised ? 8 : 55,
            scale: isLitAndRaised ? 1 : 0.92,
          }}
          transition={{
            type: 'spring',
            stiffness: 115,
            damping: 17,
            delay: isLitAndRaised ? 0.08 : 0,
          }}
          style={{
            pointerEvents: isLitAndRaised ? 'auto' : 'none',
          }}
          aria-hidden={!isLitAndRaised}
          className="w-full flex flex-col items-center"
        >
          <AnimatePresence mode="wait">
            {isOtpStep ? (
              /* OTP VERIFICATION CARD (Used once for Sign Up OR for Forgot Password) */
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="w-full space-y-3"
              >
                {emailServiceError && (
                  <div
                    role="alert"
                    dir="rtl"
                    className="w-full rounded-2xl bg-rose-950/90 border border-rose-500/45 px-4 py-3 space-y-2 shadow-lg text-right"
                  >
                    <p className="text-xs font-bold text-rose-200 leading-relaxed">
                      {emailServiceError}
                    </p>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        disabled={isSendingOtp || sendCooldownSeconds > 0}
                        onClick={() => {
                          void dispatchGmailVerificationMessage(email.trim(), name.trim());
                        }}
                        className="px-3 py-1 rounded-lg bg-rose-500/25 hover:bg-rose-500/35 border border-rose-400/40 text-[11px] font-bold text-rose-100 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {isSendingOtp
                          ? 'جاري إعادة المحاولة...'
                          : sendCooldownSeconds > 0
                            ? `إعادة المحاولة بعد ${sendCooldownSeconds} ث`
                            : 'إعادة المحاولة'}
                      </button>
                    </div>
                  </div>
                )}

                <OtpVerificationCardDemo
                  expectedCode={sentOtpCode}
                  enforceExpectedMatch={true}
                  expiresAt={otpExpiresAt}
                  initialCooldownSeconds={OTP_RESEND_COOLDOWN_SECONDS}
                  subtitleText=""
                  onResendOtp={async () => {
                    await dispatchGmailVerificationMessage(email.trim(), name.trim());
                  }}
                  onVerifiedImmediate={() => {
                    if (step === 'otp-reset') {
                      setIsOtpVerifiedForReset(true);
                    }
                  }}
                  onVerifiedSuccess={() => {
                    if (step === 'otp-signup') {
                      finalizeSignUpAfterOtp();
                    } else {
                      setIsOtpVerifiedForReset(true);
                      setStep('reset-password');
                    }
                  }}
                />

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setStep(step === 'otp-signup' ? 'signup' : 'login');
                    }}
                    className="text-xs font-semibold text-neutral-400 hover:text-amber-300 transition-colors cursor-pointer"
                  >
                    ← الرجوع لتعديل البريد الإلكتروني
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="w-full max-w-[360px] mx-auto rounded-[24px] px-7 py-7 backdrop-blur-xl"
                style={{
                  backgroundColor: 'rgba(34, 34, 34, 0.76)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  boxShadow: '0 24px 55px rgba(0, 0, 0, 0.65)',
                }}
              >
                {/* Mode Switcher Tabs for Login vs Sign Up */}
                {(step === 'login' || step === 'signup') && (
                  <div
                    dir="rtl"
                    className="grid grid-cols-2 gap-1.5 p-1 mb-5 rounded-xl bg-black/35 border border-white/10"
                  >
                    <button
                      id="entry-switch-to-login-btn"
                      type="button"
                      tabIndex={isLitAndRaised ? 0 : -1}
                      onClick={() => {
                        setStep('login');
                        setError(null);
                      }}
                      className={`py-2 text-xs font-extrabold rounded-lg transition-all cursor-pointer ${
                        step === 'login'
                          ? 'bg-amber-400 text-slate-950 shadow-sm'
                          : 'text-neutral-300 hover:text-white'
                      }`}
                    >
                      تسجيل الدخول
                    </button>
                    <button
                      id="entry-switch-to-signup-btn"
                      type="button"
                      tabIndex={isLitAndRaised ? 0 : -1}
                      onClick={() => {
                        setStep('signup');
                        setError(null);
                        setSuccessNotice(null);
                      }}
                      className={`py-2 text-xs font-extrabold rounded-lg transition-all cursor-pointer ${
                        step === 'signup'
                          ? 'bg-amber-400 text-slate-950 shadow-sm'
                          : 'text-neutral-300 hover:text-white'
                      }`}
                    >
                      إنشاء حساب
                    </button>
                  </div>
                )}

                {step === 'login' && (
                  /* 2. LOGIN SCREEN (تسجيل الدخول بالبريد وكلمة المرور بدون OTP) */
                  <div className="space-y-4">
                    <div className="text-center">
                      <h1 className="text-[22px] font-extrabold text-white tracking-tight">
                        تسجيل الدخول
                      </h1>
                    </div>

                    {successNotice && (
                      <div
                        role="status"
                        dir="rtl"
                        className="p-2.5 rounded-xl bg-emerald-950/85 border border-emerald-500/40 text-xs font-bold text-emerald-200 text-center"
                      >
                        {successNotice}
                      </div>
                    )}

                    <form onSubmit={handleLoginSubmit} className="space-y-3.5" noValidate>
                      <div>
                        <input
                          id="entry-student-gmail"
                          aria-label="Gmail"
                          type="email"
                          dir="ltr"
                          required
                          disabled={authLockoutSeconds > 0}
                          tabIndex={isLitAndRaised ? 0 : -1}
                          placeholder="example@gmail.com"
                          value={email}
                          onChange={(e) => {
                            setEmail(e.target.value);
                            setError(null);
                          }}
                          className="w-full h-11 px-4 text-sm bg-[#3a3a3a]/85 border border-white/15 rounded-xl text-white placeholder-neutral-400 focus:outline-none focus:border-[#ffd24c] focus:ring-1 focus:ring-[#ffd24c]/50 disabled:opacity-60 transition-all"
                        />
                      </div>

                      <div>
                        <input
                          id="entry-student-password"
                          aria-label="Password"
                          type="password"
                          dir="ltr"
                          required
                          disabled={authLockoutSeconds > 0}
                          tabIndex={isLitAndRaised ? 0 : -1}
                          placeholder="••••••"
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            setError(null);
                          }}
                          className="w-full h-11 px-4 text-sm bg-[#3a3a3a]/85 border border-white/15 rounded-xl text-white placeholder-neutral-400 focus:outline-none focus:border-[#ffd24c] focus:ring-1 focus:ring-[#ffd24c]/50 disabled:opacity-60 transition-all"
                        />
                      </div>

                      <div dir="rtl" className="flex items-center justify-between">
                        <button
                          id="entry-forgot-password-btn"
                          type="button"
                          tabIndex={isLitAndRaised ? 0 : -1}
                          onClick={() => {
                            setError(null);
                            setSuccessNotice(null);
                            setStep('forgot-email');
                          }}
                          className="text-xs font-bold text-amber-300 hover:text-amber-200 underline underline-offset-4 transition-colors cursor-pointer"
                        >
                          نسيت كلمة المرور؟
                        </button>
                      </div>

                      {error && (
                        <div
                          role="alert"
                          dir="rtl"
                          className="p-2.5 rounded-xl bg-rose-950/80 border border-rose-500/40 text-xs font-semibold text-rose-200 text-center"
                        >
                          {error}
                        </div>
                      )}

                      <button
                        id="entry-login-submit-btn"
                        type="submit"
                        disabled={authLockoutSeconds > 0}
                        tabIndex={isLitAndRaised ? 0 : -1}
                        dir="rtl"
                        className="w-full h-11 px-5 text-sm font-extrabold text-[#1c1917] bg-gradient-to-r from-[#ffe47a] via-[#ffd147] to-[#f5a623] hover:brightness-105 disabled:opacity-75 disabled:cursor-not-allowed rounded-xl shadow-[0_6px_20px_rgba(245,166,35,0.28)] transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 inline-flex items-center justify-center gap-2"
                      >
                        {authLockoutSeconds > 0 ? (
                          <span>مغلق مؤقتاً ({authLockoutSeconds} ث)</span>
                        ) : (
                          <span>تسجيل الدخول</span>
                        )}
                      </button>
                    </form>
                  </div>
                )}

                {step === 'signup' && (
                  /* 1. SIGN UP SCREEN (إنشاء حساب جديد: الاسم + الغرفة + Gmail + كلمة المرور -> يطلب OTP مرة واحدة فقط) */
                  <div className="space-y-4">
                    <div className="text-center">
                      <h1 className="text-[22px] font-extrabold text-white tracking-tight">
                        إنشاء حساب جديد
                      </h1>
                    </div>

                    <form onSubmit={handleSignUpSubmit} className="space-y-3" noValidate>
                      <div dir="rtl">
                        <input
                          id="entry-signup-name"
                          aria-label="الاسم ثنائي (Full Name)"
                          type="text"
                          lang="ar"
                          dir="rtl"
                          required
                          disabled={isSendingOtp || authLockoutSeconds > 0}
                          tabIndex={isLitAndRaised ? 0 : -1}
                          placeholder="الاسم ثنائي"
                          value={name}
                          onChange={(e) => {
                            const rawVal = toEnglishDigits(e.target.value);
                            if (/[a-zA-Z0-9]/.test(rawVal)) {
                              setName(rawVal.replace(/[a-zA-Z0-9]/g, ''));
                              setError('يرجى كتابة الاسم باللغة العربية فقط.');
                              return;
                            }
                            setName(rawVal);
                            setError(null);
                          }}
                          className="w-full h-11 px-4 text-sm bg-[#3a3a3a]/85 border border-white/15 rounded-xl text-white placeholder-neutral-400 focus:outline-none focus:border-[#ffd24c] focus:ring-1 focus:ring-[#ffd24c]/50 disabled:opacity-60"
                        />
                      </div>

                      <div dir="rtl">
                        <input
                          id="entry-signup-room"
                          aria-label="رقم الغرفة (Room Number)"
                          type="text"
                          inputMode="numeric"
                          dir="ltr"
                          required
                          disabled={isSendingOtp || authLockoutSeconds > 0}
                          tabIndex={isLitAndRaised ? 0 : -1}
                          placeholder="رقم الغرفة"
                          value={room}
                          onChange={(e) => {
                            const engDigits = toEnglishDigits(e.target.value).replace(/[^0-9]/g, '');
                            setRoom(engDigits);
                            setError(null);
                          }}
                          className="w-full h-11 px-4 text-sm font-mono tabular-nums text-right bg-[#3a3a3a]/85 border border-white/15 rounded-xl text-white placeholder-neutral-400 focus:outline-none focus:border-[#ffd24c] focus:ring-1 focus:ring-[#ffd24c]/50 disabled:opacity-60"
                        />
                      </div>

                      <div>
                        <input
                          id="entry-student-gmail"
                          aria-label="Gmail"
                          type="email"
                          dir="ltr"
                          required
                          disabled={isSendingOtp || authLockoutSeconds > 0}
                          tabIndex={isLitAndRaised ? 0 : -1}
                          placeholder="example@gmail.com"
                          value={email}
                          onChange={(e) => {
                            setEmail(e.target.value);
                            setError(null);
                          }}
                          className="w-full h-11 px-4 text-sm bg-[#3a3a3a]/85 border border-white/15 rounded-xl text-white placeholder-neutral-400 focus:outline-none focus:border-[#ffd24c] focus:ring-1 focus:ring-[#ffd24c]/50 disabled:opacity-60 transition-all"
                        />
                      </div>

                      <div>
                        <input
                          id="entry-student-password"
                          aria-label="Password"
                          type="password"
                          dir="ltr"
                          required
                          disabled={isSendingOtp || authLockoutSeconds > 0}
                          tabIndex={isLitAndRaised ? 0 : -1}
                          placeholder="كلمة المرور"
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            setError(null);
                          }}
                          className="w-full h-11 px-4 text-sm bg-[#3a3a3a]/85 border border-white/15 rounded-xl text-white placeholder-neutral-400 focus:outline-none focus:border-[#ffd24c] focus:ring-1 focus:ring-[#ffd24c]/50 disabled:opacity-60 transition-all"
                        />
                      </div>

                      {error && (
                        <div
                          role="alert"
                          dir="rtl"
                          className="p-2.5 rounded-xl bg-rose-950/80 border border-rose-500/40 text-xs font-semibold text-rose-200 text-center"
                        >
                          {error}
                        </div>
                      )}

                      <button
                        id="entry-signup-submit-btn"
                        type="submit"
                        disabled={isSendingOtp || authLockoutSeconds > 0}
                        aria-busy={isSendingOtp}
                        tabIndex={isLitAndRaised ? 0 : -1}
                        dir="rtl"
                        className="w-full h-11 px-5 text-sm font-extrabold text-[#1c1917] bg-gradient-to-r from-[#ffe47a] via-[#ffd147] to-[#f5a623] hover:brightness-105 disabled:opacity-75 disabled:cursor-not-allowed rounded-xl shadow-[0_6px_20px_rgba(245,166,35,0.28)] transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 inline-flex items-center justify-center gap-2.5"
                      >
                        {isSendingOtp ? (
                          <>
                            <span
                              aria-hidden="true"
                              className="w-4 h-4 rounded-full border-2 border-[#1c1917] border-t-transparent animate-spin shrink-0"
                            />
                            <span>جاري إرسال كود التحقق...</span>
                          </>
                        ) : authLockoutSeconds > 0 ? (
                          <span>مغلق مؤقتاً ({authLockoutSeconds} ث)</span>
                        ) : (
                          <span>إنشاء حساب</span>
                        )}
                      </button>
                    </form>
                  </div>
                )}

                {step === 'forgot-email' && (
                  /* 3A. FORGOT PASSWORD STEP 1: Enter registered Gmail -> Send OTP */
                  <div className="space-y-4">
                    <div className="text-center">
                      <h2 className="text-xl font-extrabold text-white tracking-tight">
                        استرجاع كلمة المرور
                      </h2>
                    </div>

                    <form onSubmit={handleForgotPasswordRequestOtp} className="space-y-3.5" noValidate>
                      <div>
                        <input
                          id="entry-forgot-email-input"
                          aria-label="Registered Gmail"
                          type="email"
                          dir="ltr"
                          required
                          disabled={isSendingOtp || authLockoutSeconds > 0}
                          placeholder="example@gmail.com"
                          value={email}
                          onChange={(e) => {
                            setEmail(e.target.value);
                            setError(null);
                          }}
                          className="w-full h-11 px-4 text-sm bg-[#3a3a3a]/85 border border-white/15 rounded-xl text-white placeholder-neutral-400 focus:outline-none focus:border-[#ffd24c] focus:ring-1 focus:ring-[#ffd24c]/50"
                        />
                      </div>

                      {error && (
                        <div
                          role="alert"
                          dir="rtl"
                          className="p-2.5 rounded-xl bg-rose-950/80 border border-rose-500/40 text-xs font-semibold text-rose-200 text-center"
                        >
                          {error}
                        </div>
                      )}

                      <button
                        id="entry-forgot-send-otp-btn"
                        type="submit"
                        disabled={isSendingOtp || authLockoutSeconds > 0}
                        aria-busy={isSendingOtp}
                        dir="rtl"
                        className="w-full h-11 px-5 text-sm font-extrabold text-[#1c1917] bg-gradient-to-r from-[#ffe47a] via-[#ffd147] to-[#f5a623] hover:brightness-105 disabled:opacity-75 rounded-xl shadow-[0_6px_20px_rgba(245,166,35,0.28)] transition-all cursor-pointer inline-flex items-center justify-center gap-2"
                      >
                        {isSendingOtp ? (
                          <>
                            <span
                              aria-hidden="true"
                              className="w-4 h-4 rounded-full border-2 border-[#1c1917] border-t-transparent animate-spin shrink-0"
                            />
                            <span>جاري إرسال كود التحقق...</span>
                          </>
                        ) : authLockoutSeconds > 0 ? (
                          <span>مغلق مؤقتاً ({authLockoutSeconds} ث)</span>
                        ) : (
                          <span>إرسال كود التحقق (OTP)</span>
                        )}
                      </button>

                      <div className="text-center pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setError(null);
                            setStep('login');
                          }}
                          className="text-xs font-semibold text-neutral-400 hover:text-amber-300 transition-colors cursor-pointer"
                        >
                          ← الرجوع لتسجيل الدخول
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {step === 'reset-password' && (
                  /* 3B. FORGOT PASSWORD STEP 3: Set New Password after OTP is verified */
                  <div className="space-y-4">
                    <div className="text-center space-y-1">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-[11px] font-extrabold text-emerald-300">
                        <span>✓ تم التحقق من الكود بنجاح</span>
                      </div>
                      <h2 className="text-xl font-extrabold text-white tracking-tight pt-1">
                        تعيين كلمة مرور جديدة
                      </h2>
                    </div>

                    <form onSubmit={handleResetPasswordSubmit} className="space-y-3.5" noValidate>
                      <div>
                        <input
                          id="entry-new-password-input"
                          aria-label="كلمة المرور الجديدة"
                          type="password"
                          dir="ltr"
                          required
                          placeholder="كلمة المرور الجديدة"
                          value={newPassword}
                          onChange={(e) => {
                            setNewPassword(e.target.value);
                            setError(null);
                          }}
                          className="w-full h-11 px-4 text-sm bg-[#3a3a3a]/85 border border-white/15 rounded-xl text-white placeholder-neutral-400 focus:outline-none focus:border-[#ffd24c] focus:ring-1 focus:ring-[#ffd24c]/50"
                        />
                      </div>

                      <div>
                        <input
                          id="entry-confirm-new-password-input"
                          aria-label="تأكيد كلمة المرور الجديدة"
                          type="password"
                          dir="ltr"
                          placeholder="تأكيد كلمة المرور الجديدة"
                          value={confirmNewPassword}
                          onChange={(e) => {
                            setConfirmNewPassword(e.target.value);
                            setError(null);
                          }}
                          className="w-full h-11 px-4 text-sm bg-[#3a3a3a]/85 border border-white/15 rounded-xl text-white placeholder-neutral-400 focus:outline-none focus:border-[#ffd24c] focus:ring-1 focus:ring-[#ffd24c]/50"
                        />
                      </div>

                      {error && (
                        <div
                          role="alert"
                          dir="rtl"
                          className="p-2.5 rounded-xl bg-rose-950/80 border border-rose-500/40 text-xs font-semibold text-rose-200 text-center"
                        >
                          {error}
                        </div>
                      )}

                      <button
                        id="entry-save-new-password-btn"
                        type="submit"
                        dir="rtl"
                        className="w-full h-11 px-5 text-sm font-extrabold text-[#1c1917] bg-gradient-to-r from-[#ffe47a] via-[#ffd147] to-[#f5a623] hover:brightness-105 rounded-xl shadow-[0_6px_20px_rgba(245,166,35,0.28)] transition-all cursor-pointer"
                      >
                        حفظ كلمة المرور وتوجه لتسجيل الدخول
                      </button>
                    </form>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Subtle Supervisor Edition entry button below the card */}
          {!isOtpStep && (
            <button
              type="button"
              tabIndex={isLitAndRaised ? 0 : -1}
              onClick={() => onEnterEdition('master')}
              className="mt-4 px-4 py-1.5 text-xs font-semibold text-neutral-400 hover:text-[#ffd24c] transition-colors cursor-pointer"
            >
              دخول نسخة المشرف
            </button>
          )}
        </motion.div>
      </div>
    </div>
  );
};

