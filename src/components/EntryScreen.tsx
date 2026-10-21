import React, { useState } from 'react';
import { DORM_ROOMS, type DormRoom } from '../types/orders';
import type { AppEdition } from './TopBar';

interface EntryScreenProps {
  initialName: string;
  initialRoom: DormRoom | '';
  onSaveStudentProfileAndEnter: (name: string, room: DormRoom) => void;
  onEnterEdition: (edition: AppEdition) => void;
}

export const EntryScreen: React.FC<EntryScreenProps> = ({
  initialName,
  initialRoom,
  onSaveStudentProfileAndEnter,
  onEnterEdition,
}) => {
  const [name, setName] = useState<string>(initialName);
  const [room, setRoom] = useState<DormRoom | ''>(initialRoom);
  const [error, setError] = useState<string | null>(null);

  const handleSubmitStudentLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('من فضلك اكتب اسمك الأول علشان يتحفظ على موبايلك.');
      return;
    }
    if (!room || !DORM_ROOMS.includes(room as DormRoom)) {
      setError('من فضلك اختر الأوضة علشان تفضل محفوظة مع اسمك.');
      return;
    }
    setError(null);
    onSaveStudentProfileAndEnter(trimmedName, room as DormRoom);
  };

  return (
    <div
      id="entry-screen"
      className="max-w-md mx-auto my-4 sm:my-8 bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6"
    >
      {/* App Icon Centered on the Login / Start Screen */}
      <div className="flex flex-col items-center text-center space-y-3">
        <img
          src="/sakan-icon-maskable-512.png"
          alt="أيقونة تطبيق طلبات السكن"
          referrerPolicy="no-referrer"
          className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl shadow-md border border-slate-800 bg-black"
        />

        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
            تسجيل دخول طلبات السكن
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
            سجّل اسمك وأوضتك مرة واحدة بس وهيفضلوا محفوظين دايماً على موبايلك في كل أوردر
          </p>
        </div>
      </div>

      {/* Student Persistent Login Form (Name + Room) */}
      <form onSubmit={handleSubmitStudentLogin} className="space-y-4" noValidate>
        <div>
          <label
            htmlFor="entry-student-name"
            className="block text-xs font-bold text-slate-700 mb-1.5"
          >
            اسمك <span className="text-rose-600">*</span>
          </label>
          <input
            id="entry-student-name"
            type="text"
            required
            placeholder="اكتب اسمك الثلاثي أو الثنائي..."
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            className="w-full h-11 px-3.5 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>

        <div>
          <label
            htmlFor="entry-student-room"
            className="block text-xs font-bold text-slate-700 mb-1.5"
          >
            الأوضة <span className="text-rose-600">*</span>
          </label>
          <select
            id="entry-student-room"
            required
            value={room}
            onChange={(e) => {
              setRoom(e.target.value as DormRoom | '');
              setError(null);
            }}
            className={`w-full h-11 px-3 text-sm bg-white border rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 ${
              room === ''
                ? 'text-slate-500 border-slate-300'
                : 'text-slate-900 font-semibold border-slate-300'
            }`}
          >
            <option value="">اختر الأوضة...</option>
            {DORM_ROOMS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-800"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          className="w-full min-h-[48px] px-5 py-3 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
        >
          حفظ بياناتي والدخول للطلبات
        </button>
      </form>

      {/* Divider + Supervisor Entry */}
      <div className="pt-3 border-t border-slate-100">
        <button
          type="button"
          onClick={() => onEnterEdition('master')}
          className="w-full min-h-[44px] px-5 py-2.5 text-xs sm:text-sm font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-colors cursor-pointer"
        >
          دخول نسخة المشرف
        </button>
      </div>
    </div>
  );
};
