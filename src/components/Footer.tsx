import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer
      id="stem-footer"
      aria-label="تذييل الصفحة — STEM EL ARISH"
      className="mt-12 border-t border-slate-200 bg-white py-8 px-4 sm:px-8"
    >
      <div className="max-w-5xl mx-auto flex flex-col items-center justify-center text-center space-y-3">
        {/* STEM ARISH Exact Logo + School Name */}
        <div className="flex flex-col items-center gap-2">
          <div className="w-44 h-44 sm:w-48 sm:h-48 flex items-center justify-center">
            <img
              src="/stem-el-arish-logo.svg"
              alt="شعار STEM ARISH"
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain"
            />
          </div>

          <p
            dir="ltr"
            className="text-lg sm:text-xl font-extrabold tracking-wider text-slate-900 font-mono"
          >
            STEM EL ARISH
          </p>
        </div>

        {/* Hairline Divider */}
        <div className="w-28 h-px bg-slate-200" aria-hidden="true" />

        {/* Project Designer Credit */}
        <div className="space-y-1">
          <p className="text-sm sm:text-base font-bold text-slate-800">
            مصمم المشروع :{' '}
            <span className="text-[#6e744e] font-extrabold">
              يامن الريس
            </span>
          </p>
          <p className="text-xs sm:text-sm font-semibold text-slate-500">
            التطبيق تحت التطوير سيتم تنزيل تحديثات كل اول اسبوع
          </p>
        </div>
      </div>
    </footer>
  );
};
