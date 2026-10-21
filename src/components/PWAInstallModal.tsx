import React, { useState } from 'react';

interface PWAInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  isInstallable: boolean;
  onTriggerNativeInstall: () => Promise<boolean>;
}

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({
  isOpen,
  onClose,
  isInstallable,
  onTriggerNativeInstall,
}) => {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedApkLink, setCopiedApkLink] = useState(false);

  if (!isOpen) return null;

  const studentAppUrl = (() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('mode', 'student');
      return url.toString();
    } catch {
      return '';
    }
  })();

  const directApkUrl = (() => {
    try {
      return new URL('/stem-arish-orders.apk', window.location.origin).toString();
    } catch {
      return '/stem-arish-orders.apk';
    }
  })();

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(studentAppUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 3000);
    } catch {
      // ignore
    }
  };

  const handleCopyApkLink = async () => {
    try {
      await navigator.clipboard.writeText(directApkUrl);
      setCopiedApkLink(true);
      setTimeout(() => setCopiedApkLink(false), 3000);
    } catch {
      // ignore
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="تحميل ملف APK وتثبيت التطبيق"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 p-6 shadow-xl space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">
            تحميل تطبيق السكن (ملف APK مباشر)
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[34px] px-2.5 text-xs font-bold text-slate-500 hover:text-slate-900 rounded-lg cursor-pointer"
          >
            إغلاق
          </button>
        </div>

        <div className="space-y-4 text-xs sm:text-sm text-slate-700 leading-relaxed">
          {/* Option 1: Direct .apk file download */}
          <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-3">
            <div className="font-bold text-emerald-950">
              1. تحميل ملف <code>stem-arish-orders.apk</code> للأندرويد مباشر:
            </div>
            <p className="text-xs text-emerald-900">
              اضغط على الزرار الأخضر تحت علشان ينزل عندك ملف <strong>stem-arish-orders.apk</strong> مباشرة، أو انسخ رابط التحميل المباشر وابعته لزمايلك على واتساب:
            </p>
            <div className="space-y-2">
              <a
                href="/api/download-apk"
                download="stem-arish-orders.apk"
                className="w-full min-h-[44px] px-4 py-2.5 text-xs sm:text-sm font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl transition-colors flex items-center justify-center cursor-pointer"
              >
                تحميل ملف APK الآن (stem-arish-orders.apk)
              </a>

              <button
                type="button"
                onClick={handleCopyApkLink}
                className="w-full min-h-[38px] px-3.5 py-2 text-xs font-bold text-emerald-900 bg-emerald-100 hover:bg-emerald-200/80 rounded-xl transition-colors cursor-pointer"
              >
                {copiedApkLink
                  ? 'تم نسخ رابط تحميل الـ APK المباشر'
                  : 'نسخ رابط تحميل الـ APK المباشر (للواتساب أو المتصفح)'}
              </button>
            </div>
          </div>

          {/* Option 2: Direct 1-Tap Phone Installation (PWA) */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div className="font-bold text-slate-900">
              2. أو التثبيت الفوري من المتصفح (للأندرويد والآيفون):
            </div>
            {isInstallable ? (
              <button
                type="button"
                onClick={async () => {
                  const accepted = await onTriggerNativeInstall();
                  if (accepted) onClose();
                }}
                className="w-full min-h-[42px] px-4 py-2 text-xs sm:text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                تثبيت فوري على الشاشة الرئيسية
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-slate-600">
                  لو معاك آيفون أو حابب تثبته بضغطة واحدة من المتصفح: اضغط على قائمة المتصفح <strong>(⋮)</strong> واختار <strong>تثبيت التطبيق (Install App)</strong>.
                </p>
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="w-full min-h-[38px] px-3.5 py-2 text-xs font-bold text-slate-800 bg-slate-200 hover:bg-slate-300 rounded-xl transition-colors cursor-pointer"
                >
                  {copiedUrl ? 'تم نسخ رابط نسخة الطلاب' : 'نسخ رابط نسخة الطلاب لمشاركته'}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            تمام
          </button>
        </div>
      </div>
    </div>
  );
};
