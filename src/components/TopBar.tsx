import React from 'react';

export type AppEdition = 'student' | 'master';

interface TopBarProps {
  edition: AppEdition;
  onSelectEdition: (edition: AppEdition) => void;
  onOpenInstallModal: () => void;
  isInstalled: boolean;
  onOpenEntryScreen?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  edition,
  onSelectEdition,
  onOpenInstallModal,
  isInstalled,
  onOpenEntryScreen,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-3 sm:px-8 py-2.5 sm:py-3">
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-1.5 sm:gap-4">
        {/* Zone 1: Brand Title */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            onOpenEntryScreen?.();
          }}
          className="text-sm sm:text-lg font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          طلبات السكن
        </a>

        {/* Zone 2: Edition Switcher (Student Edition vs Master Edition) */}
        <nav
          aria-label="اختيار النسخة"
          className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200/80"
        >
          <button
            type="button"
            onClick={() => onSelectEdition('student')}
            className={`min-h-[36px] px-2 sm:px-3.5 py-1 text-[11px] sm:text-sm font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              edition === 'student'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            نسخة الطلاب
          </button>
          <button
            type="button"
            onClick={() => onSelectEdition('master')}
            className={`min-h-[36px] px-2 sm:px-3.5 py-1 text-[11px] sm:text-sm font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              edition === 'master'
                ? 'bg-amber-700 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            نسخة المشرف
          </button>
        </nav>
      </div>
    </header>
  );
};
