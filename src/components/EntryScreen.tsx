import React, { useState } from 'react';
import { motion } from 'motion/react';
import { type DormRoom } from '../types/orders';
import type { AppEdition } from './TopBar';
import {
  SAVED_STUDENT_NAME_KEY,
  SAVED_STUDENT_ROOM_KEY,
  SAVED_STUDENT_EMAIL_KEY,
} from './OrderFormCard';
import {
  sanitizeTextInput,
  normalizeDormRoomInput,
  toEnglishDigits,
  validateStudentProfileInput,
  createVerifiedSessionPayload,
  type RegisteredStudentAccountRecord,
} from '../utils/emailOtpService';

export const REGISTERED_ACCOUNTS_KEY = 'sakan_registered_student_accounts_v4';
export const VERIFIED_SESSION_STORAGE_KEY = 'sakan_verified_session_v9';
export const SAVED_STUDENT_PASSWORD_KEY = 'sakan_saved_student_password_v1';

export interface StoredStudentAccount extends RegisteredStudentAccountRecord {
  room: DormRoom;
}

export function loadRegisteredAccounts(): Record<string, StoredStudentAccount> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(REGISTERED_ACCOUNTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, StoredStudentAccount>;
  } catch {
    return {};
  }
}

interface EntryScreenProps {
  initialName: string;
  initialRoom: DormRoom | '';
  initialEmail?: string;
  onSaveStudentProfileAndEnter: (name: string, room: DormRoom, email?: string) => void;
  onEnterEdition: (edition: AppEdition) => void;
}

export const EntryScreen: React.FC<EntryScreenProps> = ({
  initialName,
  initialRoom,
  onSaveStudentProfileAndEnter,
  onEnterEdition,
}) => {
  const [name, setName] = useState<string>(() => {
    if (initialName) return initialName;
    try {
      return localStorage.getItem(SAVED_STUDENT_NAME_KEY) || '';
    } catch {
      return '';
    }
  });

  const [room, setRoom] = useState<string>(() => {
    if (initialRoom) return initialRoom.replace(/\D/g, '');
    try {
      return (localStorage.getItem(SAVED_STUDENT_ROOM_KEY) || '').replace(/\D/g, '');
    } catch {
      return '';
    }
  });

  const [error, setError] = useState<string | null>(null);
  const [isLampOn, setIsLampOn] = useState<boolean>(true);
  const [isSwinging, setIsSwinging] = useState<boolean>(false);

  const handleToggleLamp = () => {
    setIsSwinging(true);
    setIsLampOn((prev) => !prev);
    setError(null);
    window.setTimeout(() => setIsSwinging(false), 750);
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const profileCheck = validateStudentProfileInput(name, room);
      if (!profileCheck.valid) {
        setError(profileCheck.errorAr || 'من فضلك اكتب الاسم ثنائي ورقم الغرفة بشكل صحيح.');
        return;
      }

      const cleanName = sanitizeTextInput(profileCheck.sanitizedName, 60);
      const cleanRoom = (normalizeDormRoomInput(profileCheck.sanitizedRoom) ||
        profileCheck.sanitizedRoom) as DormRoom;
      const syntheticEmail = 'student@sakan.local';

      try {
        localStorage.setItem(SAVED_STUDENT_NAME_KEY, cleanName);
        localStorage.setItem(SAVED_STUDENT_ROOM_KEY, cleanRoom);
        localStorage.setItem(SAVED_STUDENT_EMAIL_KEY, syntheticEmail);
        const verifiedSession = createVerifiedSessionPayload(syntheticEmail, cleanName, cleanRoom);
        localStorage.setItem(VERIFIED_SESSION_STORAGE_KEY, JSON.stringify(verifiedSession));
      } catch {
        // ignore storage quota errors
      }

      setError(null);
      onSaveStudentProfileAndEnter(cleanName, cleanRoom, syntheticEmail);
    } catch {
      setError('حدث خطأ أثناء تسجيل الدخول — يرجى المحاولة مرة أخرى.');
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

  const isLitAndRaised = isLampOn;

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
        {/* Persistent Animated Lamp */}
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

        {/* Auth Card underneath the lamp (Name + Room ONLY) */}
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
          <div
            className="w-full max-w-[360px] mx-auto rounded-[24px] px-7 py-7 backdrop-blur-xl space-y-4"
            style={{
              backgroundColor: 'rgba(34, 34, 34, 0.76)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              boxShadow: '0 24px 55px rgba(0, 0, 0, 0.65)',
            }}
          >
            <div className="text-center">
              <h1 className="text-[22px] font-extrabold text-white tracking-tight">
                تسجيل الدخول
              </h1>
            </div>

            <form onSubmit={handleLoginSubmit} className="space-y-3.5" noValidate>
              <div dir="rtl">
                <input
                  id="entry-login-name"
                  aria-label="الاسم ثنائي"
                  type="text"
                  lang="ar"
                  dir="rtl"
                  required
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
                  className="w-full h-11 px-4 text-sm bg-[#3a3a3a]/85 border border-white/15 rounded-xl text-white placeholder-neutral-400 focus:outline-none focus:border-[#ffd24c] focus:ring-1 focus:ring-[#ffd24c]/50 transition-all"
                />
              </div>

              <div dir="rtl">
                <input
                  id="entry-login-room"
                  aria-label="رقم الغرفة"
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  required
                  tabIndex={isLitAndRaised ? 0 : -1}
                  placeholder="رقم الغرفة"
                  value={room}
                  onChange={(e) => {
                    const engDigits = toEnglishDigits(e.target.value).replace(/[^0-9]/g, '');
                    setRoom(engDigits);
                    setError(null);
                  }}
                  className="w-full h-11 px-4 text-sm font-mono tabular-nums text-right bg-[#3a3a3a]/85 border border-white/15 rounded-xl text-white placeholder-neutral-400 focus:outline-none focus:border-[#ffd24c] focus:ring-1 focus:ring-[#ffd24c]/50 transition-all"
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
                id="entry-login-submit-btn"
                type="submit"
                tabIndex={isLitAndRaised ? 0 : -1}
                dir="rtl"
                className="w-full h-11 px-5 text-sm font-extrabold text-[#1c1917] bg-gradient-to-r from-[#ffe47a] via-[#ffd147] to-[#f5a623] hover:brightness-105 rounded-xl shadow-[0_6px_20px_rgba(245,166,35,0.28)] transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 inline-flex items-center justify-center gap-2"
              >
                <span>دخول السكن وحفظ البيانات</span>
              </button>
            </form>
          </div>

          {/* Subtle Supervisor Edition entry button below the card */}
          <button
            type="button"
            tabIndex={isLitAndRaised ? 0 : -1}
            onClick={() => onEnterEdition('master')}
            className="mt-4 px-4 py-1.5 text-xs font-semibold text-neutral-400 hover:text-[#ffd24c] transition-colors cursor-pointer"
          >
            دخول نسخة المشرف
          </button>
        </motion.div>
      </div>
    </div>
  );
};
