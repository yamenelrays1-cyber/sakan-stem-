import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  validateOtpCodeInput,
  toEnglishDigits,
  OTP_EXPIRY_MS,
  OTP_RESEND_COOLDOWN_SECONDS,
  MAX_AUTH_ATTEMPTS,
  evaluateAttemptRateLimit,
} from '../utils/emailOtpService';

export type ShowcaseTab = 'sakan' | 'magic-lamp' | 'otp' | 'anime-loading' | 'logout-demo';

/* ============================================================================
 * 1. MAGIC LAMP LOGIN COMPONENT (Interactive Lamp Toggle, Swing, Golden Dust)
 * ============================================================================ */
export const MagicLampLoginDemo: React.FC<{
  onAuthenticated?: (username: string) => void;
}> = ({ onAuthenticated }) => {
  const [isLampOn, setIsLampOn] = useState<boolean>(true);
  const [isSwinging, setIsSwinging] = useState<boolean>(false);
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [signedInMessage, setSignedInMessage] = useState<string | null>(null);

  const handleToggleLamp = () => {
    setIsSwinging(true);
    setIsLampOn((prev) => !prev);
    window.setTimeout(() => setIsSwinging(false), 700);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    setSignedInMessage(`Welcome back, ${username.trim()}! ✨`);
    if (onAuthenticated) {
      onAuthenticated(username.trim());
    }
    window.setTimeout(() => setSignedInMessage(null), 2500);
  };

  // Pre-computed golden dust particle positions
  const particles = [
    { id: 1, left: '18%', top: '28%', size: 4, delay: 0, duration: 5.5 },
    { id: 2, left: '32%', top: '65%', size: 3, delay: 0.8, duration: 6.2 },
    { id: 3, left: '48%', top: '22%', size: 5, delay: 1.4, duration: 4.8 },
    { id: 4, left: '64%', top: '72%', size: 3.5, delay: 0.4, duration: 5.9 },
    { id: 5, left: '78%', top: '34%', size: 4.5, delay: 1.9, duration: 5.2 },
    { id: 6, left: '25%', top: '48%', size: 3, delay: 2.3, duration: 6.5 },
    { id: 7, left: '72%', top: '54%', size: 4, delay: 1.1, duration: 5.7 },
    { id: 8, left: '54%', top: '80%', size: 3.5, delay: 0.6, duration: 6.0 },
  ];

  return (
    <div
      id="magic-lamp-demo"
      className="relative min-h-[calc(100vh-56px)] w-full flex flex-col items-center justify-center px-4 py-10 overflow-hidden transition-colors duration-700"
      style={{
        backgroundColor: isLampOn ? '#0a0b10' : '#030407',
      }}
    >
      {/* Large Warm Golden Radial Background Glow (Visible when Lamp is ON) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-opacity duration-700"
        style={{
          opacity: isLampOn ? 1 : 0.04,
          background:
            'radial-gradient(circle at 50% 44%, rgba(250, 204, 21, 0.28) 0%, rgba(245, 158, 11, 0.12) 28%, rgba(10, 11, 16, 0) 68%)',
        }}
      />

      {/* Floating Golden Dust Particles when ON */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 transition-opacity duration-700 ${
          isLampOn ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {particles.map((p) => (
          <motion.span
            key={p.id}
            animate={{
              y: [0, -24, 0],
              x: [0, 8, -6, 0],
              opacity: isLampOn ? [0.25, 0.85, 0.25] : 0,
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
            className="absolute rounded-full bg-amber-300 shadow-[0_0_10px_#facc15]"
          />
        ))}
      </div>

      {/* Instruction Above the Card */}
      <p
        className={`relative z-10 mb-5 text-xs sm:text-sm font-semibold tracking-wide transition-all duration-500 ${
          isLampOn ? 'text-amber-200' : 'text-slate-400'
        }`}
      >
        Click the lamp and see the magic ✨
      </p>

      {/* Glassmorphism Login Card */}
      <div
        className="relative z-10 w-full max-w-[390px] rounded-3xl px-7 pb-8 pt-0 backdrop-blur-xl transition-all duration-700"
        style={{
          backgroundColor: isLampOn
            ? 'rgba(20, 23, 34, 0.72)'
            : 'rgba(12, 14, 20, 0.35)',
          borderColor: isLampOn
            ? 'rgba(250, 204, 21, 0.28)'
            : 'rgba(255, 255, 255, 0.06)',
          borderWidth: '1px',
          borderStyle: 'solid',
          boxShadow: isLampOn
            ? '0 25px 60px rgba(0, 0, 0, 0.65), 0 0 45px rgba(250, 204, 21, 0.14)'
            : '0 10px 30px rgba(0, 0, 0, 0.85)',
        }}
      >
        {/* Hanging Lamp with Short Cord at the Top of the Card */}
        <div className="flex flex-col items-center mb-4">
          <motion.button
            type="button"
            id="btn-magic-lamp-toggle"
            onClick={handleToggleLamp}
            aria-pressed={isLampOn}
            aria-label={isLampOn ? 'Turn magic lamp off' : 'Turn magic lamp on'}
            animate={
              isSwinging
                ? { rotate: [0, -14, 12, -8, 5, 0] }
                : { rotate: 0 }
            }
            transition={{ duration: 0.65, ease: 'easeInOut' }}
            style={{ transformOrigin: 'top center' }}
            className="group relative flex flex-col items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-b-2xl px-4 pb-2 cursor-pointer"
          >
            {/* Short Hanging Cord */}
            <span
              className={`w-0.5 h-7 transition-colors duration-500 ${
                isLampOn ? 'bg-amber-300/80' : 'bg-slate-600'
              }`}
            />

            {/* Stylized Lamp Shade & Glowing Bulb SVG */}
            <svg
              width="58"
              height="44"
              viewBox="0 0 58 44"
              className="overflow-visible"
              aria-hidden="true"
            >
              {/* Warm Cone Glow Under Lamp */}
              {isLampOn && (
                <ellipse
                  cx="29"
                  cy="34"
                  rx="24"
                  ry="10"
                  fill="rgba(250, 204, 21, 0.35)"
                  style={{ filter: 'blur(6px)' }}
                />
              )}

              {/* Bulb */}
              <circle
                cx="29"
                cy="28"
                r="7"
                fill={isLampOn ? '#fef08a' : '#334155'}
                style={{
                  filter: isLampOn ? 'drop-shadow(0 0 12px #facc15)' : 'none',
                  transition: 'all 0.5s ease',
                }}
              />

              {/* Lamp Cap */}
              <rect
                x="23"
                y="2"
                width="12"
                height="5"
                rx="2"
                fill={isLampOn ? '#f59e0b' : '#475569'}
              />

              {/* Trapezoid / Dome Lamp Shade */}
              <path
                d="M19 7H39L49 26C49.6 27.2 48.7 28.5 47.4 28.5H10.6C9.3 28.5 8.4 27.2 9 26L19 7Z"
                fill={isLampOn ? '#facc15' : '#1e293b'}
                stroke={isLampOn ? '#fde047' : '#475569'}
                strokeWidth="1.6"
                style={{
                  filter: isLampOn
                    ? 'drop-shadow(0 0 16px rgba(250, 204, 21, 0.65))'
                    : 'none',
                  transition: 'all 0.5s ease',
                }}
              />
            </svg>
          </motion.button>
        </div>

        {/* Form Content (Dims smoothly when Lamp is OFF, while staying keyboard accessible) */}
        <div
          className="transition-all duration-700"
          style={{
            opacity: isLampOn ? 1 : 0.22,
            filter: isLampOn ? 'brightness(1)' : 'brightness(0.55)',
          }}
        >
          <div className="text-center mb-6">
            <h1 className="text-2xl font-extrabold text-white tracking-tight">
              Welcome Back
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Sign in to continue to your account
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="magic-username"
                className="block text-xs font-semibold text-slate-300 mb-1.5"
              >
                Username
              </label>
              <input
                id="magic-username"
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full h-11 px-4 rounded-xl bg-slate-900/80 border border-slate-700/80 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30 transition-all"
              />
            </div>

            <div>
              <label
                htmlFor="magic-password"
                className="block text-xs font-semibold text-slate-300 mb-1.5"
              >
                Password
              </label>
              <input
                id="magic-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-11 px-4 rounded-xl bg-slate-900/80 border border-slate-700/80 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30 transition-all"
              />
            </div>

            {signedInMessage && (
              <div
                role="status"
                className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-400/40 text-center text-xs font-bold text-amber-200"
              >
                {signedInMessage}
              </div>
            )}

            <button
              type="submit"
              className="w-full h-12 mt-2 rounded-xl font-extrabold text-sm text-slate-950 bg-gradient-to-r from-yellow-400 via-amber-400 to-orange-500 hover:from-yellow-300 hover:to-orange-400 shadow-[0_8px_25px_rgba(245,158,11,0.35)] transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            >
              Sign In
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * 2. 4-DIGIT OTP VERIFICATION CODE COMPONENT
 * ============================================================================ */
export const OtpVerificationCardDemo: React.FC<{
  expectedCode?: string;
  enforceExpectedMatch?: boolean;
  expiresAt?: number;
  initialCooldownSeconds?: number;
  subtitleText?: string;
  autoFillCode?: string | null;
  onResendOtp?: () => void | Promise<void>;
  onVerifiedImmediate?: (code: string) => void;
  onVerifiedSuccess?: (code: string) => void;
}> = ({
  expectedCode,
  enforceExpectedMatch = true,
  expiresAt,
  initialCooldownSeconds = OTP_RESEND_COOLDOWN_SECONDS,
  subtitleText = 'Enter the 4-digit code sent to your registered device.',
  autoFillCode = null,
  onResendOtp,
  onVerifiedImmediate,
  onVerifiedSuccess,
}) => {
  const [digits, setDigits] = useState<string[]>(['', '', '', '']);
  const [isVerified, setIsVerified] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isResending, setIsResending] = useState<boolean>(false);
  const [resendFeedback, setResendFeedback] = useState<boolean>(false);
  const [activeExpiresAt, setActiveExpiresAt] = useState<number>(
    () => expiresAt || Date.now() + OTP_EXPIRY_MS
  );
  const [resendCooldown, setResendCooldown] = useState<number>(initialCooldownSeconds);
  const [failedAttempts, setFailedAttempts] = useState<number>(0);
  const [lockedUntilMs, setLockedUntilMs] = useState<number>(0);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (expiresAt && expiresAt > 0) {
      setActiveExpiresAt(expiresAt);
    }
  }, [expiresAt]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTick(Date.now());
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const lockoutRemainingSeconds =
    lockedUntilMs > nowTick ? Math.max(1, Math.ceil((lockedUntilMs - nowTick) / 1000)) : 0;
  const isLockedOut = lockoutRemainingSeconds > 0;
  const expiryRemainingSeconds = Math.max(0, Math.ceil((activeExpiresAt - nowTick) / 1000));
  const isOtpExpired = expiryRemainingSeconds <= 0;

  const formatMmSs = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const verifyDigits = (nextDigits: string[]) => {
    const now = Date.now();
    if (lockedUntilMs > now) {
      const rem = Math.max(1, Math.ceil((lockedUntilMs - now) / 1000));
      setErrorMsg(
        `تم إيقاف المحاولة مؤقتاً لمدة ${rem} ثانية لتجاوز الحد المسموح من المحاولات الخاطئة.`
      );
      return;
    }

    const code = nextDigits.join('');
    if (code.length === 4 && /^\d{4}$/.test(code)) {
      const check = validateOtpCodeInput(
        code,
        expectedCode,
        enforceExpectedMatch,
        activeExpiresAt,
        now
      );
      if (!check.valid) {
        if (check.expired) {
          setErrorMsg(
            check.errorAr ||
              'انتهت صلاحية كود التحقق (5 دقائق) — يرجى الضغط على إعادة إرسال الكود.'
          );
          return;
        }
        const rateResult = evaluateAttemptRateLimit(failedAttempts, lockedUntilMs, now);
        setFailedAttempts(rateResult.nextFailedAttempts);
        setLockedUntilMs(rateResult.nextLockedUntilMs);
        setNowTick(now);
        setErrorMsg(
          rateResult.isLocked
            ? rateResult.errorAr || 'تم إيقاف المحاولة مؤقتاً لمدة 60 ثانية.'
            : `${check.errorAr || 'رمز التحقق غير صحيح'} — ${rateResult.errorAr || ''}`
        );
        return;
      }
      setErrorMsg(null);
      setFailedAttempts(0);
      setLockedUntilMs(0);
      setIsVerified(true);
      if (onVerifiedImmediate) {
        onVerifiedImmediate(code);
      }
      if (onVerifiedSuccess) {
        window.setTimeout(() => {
          onVerifiedSuccess(code);
        }, 700);
      }
    }
  };

  useEffect(() => {
    if (autoFillCode && /^\d{4}$/.test(autoFillCode) && !isVerified && !isLockedOut) {
      const next = autoFillCode.split('');
      setDigits(next);
      setErrorMsg(null);
      verifyDigits(next);
    }
  }, [autoFillCode]);

  const handleChange = (index: number, rawVal: string) => {
    if (isLockedOut) return;
    const clean = toEnglishDigits(rawVal).replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = clean;
    setDigits(next);
    setErrorMsg(null);

    if (clean && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }
    verifyDigits(next);
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isLockedOut) return;
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      const next = [...digits];
      next[index - 1] = '';
      setDigits(next);
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const code = digits.join('');
      if (code.length === 4 && /^\d{4}$/.test(code)) {
        verifyDigits(digits);
      } else {
        setErrorMsg('يرجى إدخال الـ 4 أرقام أولاً');
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (isLockedOut) return;
    const pasted = toEnglishDigits(e.clipboardData.getData('text')).replace(/\D/g, '').slice(0, 4);
    if (!pasted) return;
    const next = ['', '', '', ''];
    pasted.split('').forEach((ch, idx) => {
      next[idx] = ch;
    });
    setDigits(next);
    const focusIdx = Math.min(pasted.length, 3);
    inputRefs.current[focusIdx]?.focus();
    verifyDigits(next);
  };

  const handleResend = async () => {
    if (isResending || resendCooldown > 0 || isLockedOut) return;
    setDigits(['', '', '', '']);
    setErrorMsg(null);
    setIsVerified(false);
    setIsResending(true);
    setResendFeedback(false);
    try {
      if (onResendOtp) {
        await onResendOtp();
      }
      setActiveExpiresAt(Date.now() + OTP_EXPIRY_MS);
      setResendCooldown(OTP_RESEND_COOLDOWN_SECONDS);
      setResendFeedback(true);
      window.setTimeout(() => setResendFeedback(false), 2000);
    } catch {
      setErrorMsg('تعذر إعادة إرسال الكود حالياً — يرجى المحاولة مرة أخرى.');
    } finally {
      setIsResending(false);
      inputRefs.current[0]?.focus();
    }
  };

  return (
    <div
      id="otp-verification-demo"
      dir="ltr"
      className="w-full flex items-center justify-center"
    >
      <div
        className="w-full max-w-[390px] rounded-[26px] px-6 py-7 text-center transition-all backdrop-blur-xl"
        style={{
          backgroundColor: 'rgba(28, 30, 38, 0.88)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 24px 55px rgba(0, 0, 0, 0.7)',
        }}
      >
        {/* Top Icon: Blue Lock inside Rounded Square OR Green Circle Check */}
        <div
          className={`w-[60px] h-[60px] mx-auto mb-3.5 flex items-center justify-center transition-all duration-500 ${
            isVerified
              ? 'rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-400 scale-105'
              : 'rounded-[20px] bg-blue-500/15 border border-blue-400/30 text-blue-400'
          }`}
        >
          {!isVerified ? (
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          ) : (
            <svg
              width="30"
              height="30"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          )}
        </div>

        {/* Heading */}
        <h2 dir="rtl" className="text-2xl font-extrabold text-white mb-1.5 tracking-tight">
          كود التحقق
        </h2>

        {!isVerified ? (
          <div className="space-y-4">
            {subtitleText && (
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                {subtitleText}
              </p>
            )}

            {/* 5-Minute OTP Expiration Status Badge */}
            <div dir="rtl" className="flex items-center justify-center">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-bold font-mono tabular-nums border ${
                  isOtpExpired
                    ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                    : 'bg-slate-900/90 border-slate-700/80 text-amber-300'
                }`}
              >
                {isOtpExpired
                  ? '⏰ انتهت صلاحية الكود (5 دقائق) — أعد الإرسال'
                  : `⏳ صلاحية الكود: ${formatMmSs(expiryRemainingSeconds)}`}
              </span>
            </div>

            {/* 4 Separate OTP Digit Boxes */}
            <div
              className="flex items-center justify-center gap-3"
              role="group"
              aria-label="4-digit verification code"
            >
              {digits.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => {
                    inputRefs.current[idx] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  disabled={isLockedOut}
                  value={digit}
                  aria-label={`Digit ${idx + 1}`}
                  onChange={(e) => handleChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  onPaste={handlePaste}
                  className={`w-[56px] h-[60px] rounded-2xl border-2 text-center font-mono tabular-nums text-2xl font-extrabold text-blue-400 outline-none transition-all disabled:opacity-45 disabled:cursor-not-allowed ${
                    digit
                      ? 'border-blue-400 bg-blue-500/15 shadow-[0_0_15px_rgba(59,130,246,0.25)]'
                      : 'border-slate-700 bg-slate-900/90'
                  } focus:border-blue-400 focus:bg-slate-900 focus:ring-4 focus:ring-blue-500/20 focus:-translate-y-0.5`}
                />
              ))}
            </div>

            {isLockedOut && (
              <p role="alert" dir="rtl" className="text-xs font-bold text-rose-400">
                🔒 تم إيقاف المحاولة مؤقتاً لمدة {lockoutRemainingSeconds} ثانية لتجاوز عدد المحاولات المسموح ({MAX_AUTH_ATTEMPTS} محاولات).
              </p>
            )}

            {!isLockedOut && errorMsg && (
              <p role="alert" dir="rtl" className="text-xs font-bold text-rose-400">
                {errorMsg}
              </p>
            )}

            <div className="flex flex-col items-center gap-2 pt-1">
              <button
                type="button"
                disabled={isLockedOut || isOtpExpired}
                onClick={() => {
                  const code = digits.join('');
                  if (code.length === 4 && /^\d{4}$/.test(code)) {
                    verifyDigits(digits);
                  } else {
                    setErrorMsg('يرجى إدخال الـ 4 أرقام أولاً');
                  }
                }}
                className="w-full h-11 rounded-xl font-bold text-sm text-[#1c1917] bg-gradient-to-r from-[#ffe47a] via-[#ffd147] to-[#f5a623] hover:brightness-105 shadow-[0_6px_20px_rgba(245,166,35,0.28)] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLockedOut
                  ? `مغلق مؤقتاً (${lockoutRemainingSeconds} ث)`
                  : 'تأكيد الكود'}
              </button>

              <button
                type="button"
                disabled={isResending || resendCooldown > 0 || isLockedOut}
                aria-busy={isResending}
                onClick={handleResend}
                className="inline-flex items-center justify-center gap-2 text-xs font-bold text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 disabled:opacity-60 disabled:cursor-not-allowed px-4 py-1.5 rounded-xl transition-colors cursor-pointer"
              >
                {isResending ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="w-3.5 h-3.5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin"
                    />
                    <span>جاري إعادة الإرسال...</span>
                  </>
                ) : resendFeedback ? (
                  'تم إعادة إرسال الكود ✓'
                ) : resendCooldown > 0 ? (
                  `إعادة الإرسال بعد ${resendCooldown} ث`
                ) : (
                  'إعادة إرسال الكود'
                )}
              </button>
            </div>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="space-y-5"
          >
            <p dir="rtl" className="text-sm text-slate-300">تم التحقق من الكود بنجاح.</p>

            {/* Small Animated Green Check in the Middle */}
            <motion.div
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              className="w-14 h-14 mx-auto rounded-full bg-emerald-500/15 border-2 border-emerald-400/40 flex items-center justify-center text-emerald-400"
            >
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </motion.div>

            <div className="pt-1">
              <span dir="rtl" className="inline-block text-sm font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-400/30 px-4 py-2 rounded-full">
                تم التأكيد بنجاح
              </span>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

/* ============================================================================
 * 3. ANIME-INSPIRED LOADING SCREEN (Red 3-Comma Iris -> Purple Ripple Eyes)
 * ============================================================================ */
type EyePhase = 'crimson' | 'blink' | 'ripple';

const StylizedAnimeEye: React.FC<{
  side: 'left' | 'right';
  phase: EyePhase;
}> = ({ side, phase }) => {
  const isPurple = phase === 'ripple';
  const isBlinking = phase === 'blink';

  return (
    <div className="relative flex items-center justify-center">
      {/* Colored Glow Around Eyes */}
      <motion.div
        aria-hidden="true"
        animate={{
          backgroundColor: isPurple
            ? 'rgba(168, 85, 247, 0.45)'
            : 'rgba(239, 68, 68, 0.45)',
          scale: isBlinking ? 0.8 : isPurple ? [1, 1.2, 1.05] : [1, 1.08, 1],
          opacity: isBlinking ? 0.2 : 0.9,
        }}
        transition={{ duration: 0.6, ease: 'easeInOut' }}
        className="absolute w-36 h-20 sm:w-48 sm:h-28 rounded-full blur-2xl pointer-events-none"
      />

      <motion.div
        animate={{
          scaleY: isBlinking ? 0.04 : 1,
          scale: isPurple ? [1.14, 1] : 1,
        }}
        transition={{
          scaleY: { duration: 0.16, ease: 'easeInOut' },
          scale: { duration: 0.45, ease: 'easeOut' },
        }}
        className="relative w-32 h-16 sm:w-44 sm:h-22 flex items-center justify-center"
      >
        <svg
          viewBox="0 0 220 110"
          className={`w-full h-full overflow-visible ${
            side === 'right' ? 'scale-x-[-1]' : ''
          }`}
          aria-hidden="true"
        >
          <defs>
            <clipPath id={`eye-clip-${side}`}>
              <path d="M12,58 Q58,12 115,18 Q175,24 208,54 Q165,94 106,92 Q50,90 12,58 Z" />
            </clipPath>
            <radialGradient id={`crimson-grad-${side}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#450a0a" />
              <stop offset="35%" stopColor="#dc2626" />
              <stop offset="80%" stopColor="#991b1b" />
              <stop offset="100%" stopColor="#450a0a" />
            </radialGradient>
            <radialGradient id={`purple-grad-${side}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#3b0764" />
              <stop offset="35%" stopColor="#a855f7" />
              <stop offset="75%" stopColor="#7e22ce" />
              <stop offset="100%" stopColor="#2e1065" />
            </radialGradient>
          </defs>

          <path
            d="M12,58 Q58,12 115,18 Q175,24 208,54 Q165,94 106,92 Q50,90 12,58 Z"
            fill="#0f1115"
          />

          <g clipPath={`url(#eye-clip-${side})`}>
            <ellipse cx="110" cy="55" rx="95" ry="42" fill="#18181b" />

            <AnimatePresence mode="wait">
              {!isPurple ? (
                <motion.g
                  key="crimson-iris"
                  initial={{ opacity: 0, scale: 0.85, rotate: -60 }}
                  animate={{ opacity: 1, scale: 1, rotate: 360 }}
                  exit={{ opacity: 0, scale: 0.7 }}
                  transition={{
                    rotate: { duration: 3.5, ease: 'linear', repeat: Infinity },
                    opacity: { duration: 0.2 },
                  }}
                  style={{ originX: '110px', originY: '55px' }}
                >
                  <circle
                    cx="110"
                    cy="55"
                    r="34"
                    fill={`url(#crimson-grad-${side})`}
                    stroke="#7f1d1d"
                    strokeWidth="2.5"
                  />
                  <circle
                    cx="110"
                    cy="55"
                    r="21"
                    fill="none"
                    stroke="rgba(0,0,0,0.65)"
                    strokeWidth="1.6"
                  />
                  <circle cx="110" cy="55" r="8.5" fill="#09090b" />

                  {[0, 120, 240].map((angle) => (
                    <g key={angle} transform={`rotate(${angle} 110 55)`}>
                      <circle cx="110" cy="34" r="4.2" fill="#09090b" />
                      <path
                        d="M110,30 C118,31 121,39 116,44 C119,38 115,35 110,36 Z"
                        fill="#09090b"
                      />
                    </g>
                  ))}
                </motion.g>
              ) : (
                <motion.g
                  key="purple-iris"
                  initial={{ opacity: 0, scale: 0.75 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                  style={{ originX: '110px', originY: '55px' }}
                >
                  <circle
                    cx="110"
                    cy="55"
                    r="44"
                    fill={`url(#purple-grad-${side})`}
                  />
                  {[12, 20, 28, 36, 43].map((radius) => (
                    <circle
                      key={radius}
                      cx="110"
                      cy="55"
                      r={radius}
                      fill="none"
                      stroke="#1e1b4b"
                      strokeWidth="1.8"
                    />
                  ))}
                  <circle cx="110" cy="55" r="5.5" fill="#09090b" />
                </motion.g>
              )}
            </AnimatePresence>

            <circle cx="96" cy="43" r="4.5" fill="rgba(255,255,255,0.75)" />
            <circle cx="122" cy="64" r="2.2" fill="rgba(255,255,255,0.45)" />
          </g>

          <path
            d="M8,58 Q56,8 116,15 Q178,22 212,54"
            fill="none"
            stroke="#e4e4e7"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d="M12,58 Q50,92 106,92 Q165,94 208,54"
            fill="none"
            stroke="#71717a"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      </motion.div>
    </div>
  );
};

export const AnimeLoadingScreenDemo: React.FC = () => {
  const [phase, setPhase] = useState<EyePhase>('crimson');

  useEffect(() => {
    const runCycle = () => {
      setPhase('crimson');
      const t1 = window.setTimeout(() => setPhase('blink'), 1500);
      const t2 = window.setTimeout(() => setPhase('ripple'), 1680);
      return () => {
        window.clearTimeout(t1);
        window.clearTimeout(t2);
      };
    };

    const cleanup = runCycle();
    const interval = window.setInterval(runCycle, 5000);
    return () => {
      cleanup();
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div
      id="anime-loading-demo"
      role="status"
      aria-label="Loading animation"
      dir="ltr"
      className="min-h-screen w-full bg-black text-white flex flex-col items-center justify-center px-6 py-12 overflow-hidden select-none"
    >
      <span className="sr-only">Loading animation</span>

      {/* Pair of Stylized Anime Eyes Floating in Darkness */}
      <div className="my-auto py-12 flex items-center justify-center gap-12 sm:gap-28 md:gap-36 z-10">
        <StylizedAnimeEye side="left" phase={phase} />
        <StylizedAnimeEye side="right" phase={phase} />
      </div>
    </div>
  );
};

/* ============================================================================
 * 4. LOGOUT BUTTON ANIMATION (Reusable Button + Split Theme Demo Page)
 * ============================================================================ */
export const AnimatedLogoutButton: React.FC<{
  variant: 'dark' | 'light';
  initialLabel?: string;
  compact?: boolean;
  onLogoutComplete?: () => void;
}> = ({ variant, initialLabel = 'تسجيل الخروج', compact = false, onLogoutComplete }) => {
  const [status, setStatus] = useState<'idle' | 'logging-out' | 'logged-out'>('idle');
  const [isHovered, setIsHovered] = useState<boolean>(false);

  const handleClick = () => {
    if (status !== 'idle') return;
    setStatus('logging-out');

    window.setTimeout(() => {
      setStatus('logged-out');
    }, 650);

    window.setTimeout(() => {
      setStatus('idle');
      if (onLogoutComplete) {
        onLogoutComplete();
      }
    }, 1500);
  };

  const labelText =
    status === 'logging-out'
      ? 'جاري الخروج...'
      : status === 'logged-out'
        ? 'تم الخروج ✓'
        : initialLabel;

  const isDoorOpen = isHovered || status === 'logging-out';

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
      aria-label={labelText}
      className={`group relative ${
        compact
          ? 'min-w-[136px] sm:min-w-[152px] h-[40px] px-3.5 rounded-xl text-xs gap-2.5'
          : 'min-w-[196px] h-[56px] px-5 rounded-2xl text-sm gap-4'
      } font-bold inline-flex items-center justify-between cursor-pointer transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b5ed63] focus-visible:ring-offset-2 ${
        variant === 'dark'
          ? 'bg-[#1f2235] text-white shadow-[0_8px_20px_rgba(31,34,53,0.22)] hover:-translate-y-0.5 hover:shadow-[0_12px_26px_rgba(31,34,53,0.32),0_0_16px_rgba(59,130,246,0.25)]'
          : 'bg-white text-[#1f2235] shadow-[0_12px_30px_rgba(0,0,0,0.35)] hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(0,0,0,0.48),0_0_22px_rgba(59,130,246,0.35)]'
      }`}
    >
      <span className="whitespace-nowrap">{labelText}</span>

      {/* Blue Door & Walking Figure Icon on the Right */}
      <span
        aria-hidden="true"
        className={`${
          compact ? 'w-7 h-7 rounded-lg' : 'w-9 h-9 rounded-xl'
        } flex items-center justify-center transition-colors ${
          status === 'logged-out' ? 'bg-emerald-500/20' : 'bg-blue-500/15'
        }`}
      >
        <svg viewBox="0 0 24 24" className={`${compact ? 'w-5 h-5' : 'w-6 h-6'} overflow-visible`}>
          {/* Door Frame */}
          <path
            d="M11 4H19C19.55 4 20 4.45 20 5V19C20 19.55 19.55 20 19 20H11"
            fill="none"
            stroke={status === 'logged-out' ? '#22c55e' : '#3b82f6'}
            strokeWidth="2"
            strokeLinecap="round"
          />
          {/* Walking Figure / Outward Arrow */}
          <g
            stroke={status === 'logged-out' ? '#22c55e' : '#3b82f6'}
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transform:
                status === 'logging-out'
                  ? 'translateX(11px) scale(0.85)'
                  : isHovered
                    ? 'translateX(4px)'
                    : 'translateX(0px)',
              opacity: status === 'logging-out' ? 0 : 1,
              transition: 'transform 0.35s ease, opacity 0.3s ease',
            }}
          >
            <circle
              cx="6.5"
              cy="7.5"
              r="1.5"
              fill={status === 'logged-out' ? '#22c55e' : '#3b82f6'}
              stroke="none"
            />
            <path d="M4 12.5L7 10.5L9.5 12.5L13.5 12.5" />
            <path d="M11.5 10L14 12.5L11.5 15" />
            <path d="M6.5 13L5 17.5" />
            <path d="M7.5 13L9.5 17.5" />
          </g>
          {/* Sliding / Opening Door Leaf */}
          <rect
            x="15.5"
            y="4.5"
            width="4"
            height="15"
            rx="1"
            fill={status === 'logged-out' ? '#22c55e' : '#3b82f6'}
            style={{
              transformOrigin: '20px 12px',
              transform: isDoorOpen
                ? 'perspective(70px) rotateY(-48deg) translateX(2px)'
                : 'perspective(70px) rotateY(0deg)',
              transition: 'transform 0.35s ease, fill 0.3s ease',
            }}
          />
        </svg>
      </span>
    </button>
  );
};

export const LogoutButtonAnimationDemo: React.FC<{
  onLogoutAction?: () => void;
}> = ({ onLogoutAction }) => {
  return (
    <div
      id="logout-animation-demo"
      dir="ltr"
      className="min-h-[480px] w-full bg-[#101d24] text-white flex flex-col items-center justify-center px-5 py-12 gap-9"
    >
      {/* Large Heading */}
      <h2 className="text-3xl sm:text-5xl font-extrabold text-center tracking-tight">
        <span className="text-[#b5ed63]">Logout</span> Button Animation
      </h2>

      {/* Split Rounded Demo Panel */}
      <div className="w-full max-w-4xl min-h-[340px] rounded-[28px] border border-white/80 overflow-hidden grid grid-cols-1 sm:grid-cols-2 shadow-[0_28px_60px_rgba(0,0,0,0.45)]">
        {/* Left Half: Very Light Gray/White */}
        <div className="bg-[#f4f6f9] flex items-center justify-center p-12">
          <AnimatedLogoutButton variant="dark" onLogoutComplete={onLogoutAction} />
        </div>

        {/* Right Half: Dark Navy (#1f2235) */}
        <div className="bg-[#1f2235] flex items-center justify-center p-12">
          <AnimatedLogoutButton variant="light" onLogoutComplete={onLogoutAction} />
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * 5. INTERACTIVE SNACK ORDER BUTTON (Inline SVG Chips Bag + 7-Step Animation)
 * ============================================================================ */
export const SnackOrderButton: React.FC<{
  id?: string;
  type?: 'button' | 'submit';
  label?: string;
  successLabel?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  onOrderTrigger?: () => boolean | void | Promise<boolean | void>;
}> = ({
  id,
  type = 'button',
  label = 'Order',
  successLabel = 'Order placed!',
  disabled = false,
  fullWidth = false,
  onOrderTrigger,
}) => {
  const [animState, setAnimState] = useState<'idle' | 'animating' | 'success'>('idle');
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const startAnimationSequence = () => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];

    // Steps 1-5: Fade text, slide bag to center, pull into cannon tube, load, launch & bounce (2350ms)
    setAnimState('animating');

    // Step 6: Show green checkmark and "Order placed!" for 2 seconds (starts at 2250ms)
    const tSuccess = window.setTimeout(() => {
      setAnimState('success');
    }, 2250);

    // Step 7: Reset smoothly after 2 seconds of showing "Order placed!" (4250ms total)
    const tReset = window.setTimeout(() => {
      setAnimState('idle');
    }, 4250);

    timersRef.current.push(tSuccess, tReset);
  };

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || animState !== 'idle') {
      e.preventDefault();
      return;
    }

    if (onOrderTrigger) {
      e.preventDefault();
      const result = await onOrderTrigger();
      if (result === false) {
        return;
      }
    }

    startAnimationSequence();
  };

  const isBusy = animState !== 'idle';

  return (
    <button
      id={id}
      type={type}
      disabled={disabled || isBusy}
      aria-busy={isBusy}
      aria-live="polite"
      onClick={handleClick}
      className={`snack-order-btn ${fullWidth ? 'w-full' : ''} ${
        animState === 'animating' || animState === 'success' ? 'is-animating' : ''
      } ${animState === 'success' ? 'is-success' : ''} ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      }`}
    >
      {/* Idle Content: Inline SVG Colorful Chips Bag on Left + "Order" Text on Right */}
      <span className="snack-btn-idle-content">
        <span className="snack-bag-actor" aria-hidden="true">
          {/* Original Inline SVG Red & Yellow Chips Bag with Potato Chip Shapes */}
          <svg
            viewBox="0 0 48 56"
            width="38"
            height="44"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="chipBagRedGrad" x1="6" y1="6" x2="42" y2="50" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#ff4d4d" />
                <stop offset="52%" stopColor="#e11d48" />
                <stop offset="100%" stopColor="#9f1239" />
              </linearGradient>
              <linearGradient id="chipBagGoldBand" x1="8" y1="18" x2="40" y2="34" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#fef08a" />
                <stop offset="50%" stopColor="#facc15" />
                <stop offset="100%" stopColor="#eab308" />
              </linearGradient>
            </defs>

            {/* Top Crimped Foil Seal (Zig-Zag) */}
            <path
              d="M9 7L12 4L15 7L18 4L21 7L24 4L27 7L30 4L33 7L36 4L39 7V11H9V7Z"
              fill="#facc15"
            />

            {/* Main Crinkled Snack Bag Body */}
            <path
              d="M9 10C9 10 6.5 22 7.5 31C8.5 40 9.5 47 9.5 47H38.5C38.5 47 39.5 40 40.5 31C41.5 22 39 10 39 10H9Z"
              fill="url(#chipBagRedGrad)"
              stroke="#fda4af"
              strokeWidth="0.9"
            />

            {/* Diagonal Golden Yellow Brand Ribbon */}
            <path
              d="M7.6 22L40.4 18.5L40.2 30.5L7.8 33.5L7.6 22Z"
              fill="url(#chipBagGoldBand)"
            />

            {/* Original Simple Brand Mark: "CRISP" (No Real Logos) */}
            <rect x="13" y="21.5" width="22" height="8.5" rx="4.25" fill="#7f1d1d" />
            <text
              x="24"
              y="27.5"
              textAnchor="middle"
              fill="#fef08a"
              fontSize="5.6"
              fontWeight="900"
              fontFamily="sans-serif"
              letterSpacing="0.6"
            >
              CRISP
            </text>

            {/* Golden Potato Chip Shapes Overlapping Bottom of Bag */}
            <ellipse
              cx="19"
              cy="39"
              rx="6.2"
              ry="4.4"
              transform="rotate(-16 19 39)"
              fill="#fde047"
              stroke="#ca8a04"
              strokeWidth="1"
            />
            <ellipse
              cx="28.5"
              cy="38.5"
              rx="6.5"
              ry="4.6"
              transform="rotate(14 28.5 38.5)"
              fill="#facc15"
              stroke="#b45309"
              strokeWidth="1"
            />
            <ellipse
              cx="24"
              cy="41.5"
              rx="5.5"
              ry="3.8"
              fill="#fef08a"
              stroke="#ca8a04"
              strokeWidth="0.9"
            />
            {/* Seasoning Speckles on Potato Chips */}
            <circle cx="18" cy="38.5" r="0.6" fill="#b45309" />
            <circle cx="23.5" cy="41" r="0.65" fill="#b45309" />
            <circle cx="25.5" cy="42.2" r="0.55" fill="#b45309" />
            <circle cx="29.5" cy="38" r="0.6" fill="#b45309" />

            {/* Glossy Foil Highlight on Left Side */}
            <path
              d="M11.5 12.5C10.5 21 10.5 32 11.8 44"
              stroke="rgba(255,255,255,0.42)"
              strokeWidth="1.6"
              strokeLinecap="round"
            />

            {/* Bottom Crimped Foil Seal */}
            <path
              d="M9.5 46.5H38.5L39.5 50L36 52L33 49.5L30 52L27 49.5L24 52L21 49.5L18 52L15 49.5L12 52L8.5 50L9.5 46.5Z"
              fill="#facc15"
            />
          </svg>
        </span>

        <span className="snack-btn-label">{label}</span>
      </span>

      {/* Step 3: Colorful Delivery Tube / Packing Cannon inside the button */}
      <span className="snack-cannon-tube" aria-hidden="true">
        <svg viewBox="0 0 56 34" width="48" height="28" fill="none">
          {/* Cannon Barrel Body */}
          <rect x="8" y="8" width="40" height="22" rx="6" fill="#1e293b" stroke="#38bdf8" strokeWidth="1.8" />
          {/* Decorative Colorful Stripes on Tube */}
          <rect x="11" y="15" width="34" height="4" rx="2" fill="#facc15" />
          <rect x="11" y="21" width="34" height="3" rx="1.5" fill="#ec4899" />
          {/* Flared Top Rim of Packing Tube */}
          <rect x="4" y="3" width="48" height="7" rx="3.5" fill="#38bdf8" stroke="#bae6fd" strokeWidth="1.2" />
          {/* Inner Dark Mouth Opening */}
          <ellipse cx="28" cy="6.5" rx="19" ry="2.5" fill="#090d16" />
        </svg>
      </span>

      {/* Step 4: Brief Loading Effect (Rotating/Pulsing Dots + Progress Line) */}
      <span className="snack-loading-stage" aria-hidden="true">
        <span className="snack-rotating-dots">
          <span />
          <span />
          <span />
        </span>
        <span className="snack-progress-track">
          <span className="snack-progress-fill" />
        </span>
      </span>

      {/* Step 6: Green Checkmark & "Order placed!" shown for 2 seconds */}
      <span className="snack-success-overlay" role="status">
        <span className="snack-check-badge" aria-hidden="true">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
        <span className="snack-success-text">{successLabel}</span>
      </span>
    </button>
  );
};

export const SnackOrderButtonDemo: React.FC = () => {
  return (
    <div
      id="snack-order-demo-page"
      dir="ltr"
      className="min-h-[540px] w-full bg-[#0b132b] flex flex-col items-center justify-center px-4 py-12"
    >
      {/* Clean White Demo Area Centered on a Dark Navy Page */}
      <div className="w-full max-w-[460px] rounded-[32px] bg-white p-10 sm:p-14 shadow-[0_28px_70px_rgba(0,0,0,0.55)] flex flex-col items-center justify-center text-center gap-6">
        <div className="space-y-1.5">
          <span className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
            Interactive Micro-Interaction
          </span>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Snack Order Button
          </h2>
          <p className="text-xs text-slate-500">
            Click the button to pack and launch your crispy chips order
          </p>
        </div>

        <div className="py-4">
          <SnackOrderButton id="demo-snack-order-btn" label="Order" successLabel="Order placed!" />
        </div>
      </div>
    </div>
  );
};
