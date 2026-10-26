import React from 'react';
import { AnimatedLogoutButton } from './InteractiveShowcase';

export type AppEdition = 'student' | 'master';
export type ThemeMode = 'dark' | 'light';

interface TopBarProps {
  edition: AppEdition;
  onSelectEdition: (edition: AppEdition) => void;
  onOpenInstallModal: () => void;
  isInstalled: boolean;
  onOpenEntryScreen?: () => void;
  showLogoutButton?: boolean;
  onLogout?: () => void;
  theme?: ThemeMode;
  onToggleTheme?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  edition,
  onSelectEdition,
  onOpenEntryScreen,
  showLogoutButton = false,
  onLogout,
  theme = 'dark',
  onToggleTheme,
}) => {
  const isDark = theme === 'dark';

  return (
    <header
      className={`sticky top-0 z-30 backdrop-blur-md border-b px-3 sm:px-8 py-2.5 sm:py-3 transition-colors duration-300 ${
        isDark
          ? 'bg-[#0d1017]/95 border-white/10'
          : 'bg-white/95 border-slate-200'
      }`}
    >
      <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-2 sm:gap-4">
        {/* Zone 1: Brand Title */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            onOpenEntryScreen?.();
          }}
          className={`text-sm sm:text-lg font-extrabold tracking-tight whitespace-nowrap shrink-0 transition-colors ${
            isDark ? 'text-white' : 'text-slate-900'
          }`}
        >
          طلبات السكن
        </a>

        {/* Zone 2: Theme Toggle (Crescent Moon / Sun) + Top Log Out Button */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Dark / White Theme Toggle Button with Crescent Moon (هلال) & Sun/Day (نهار) Icons */}
          {onToggleTheme && (
            <button
              id="theme-toggle-btn"
              type="button"
              onClick={onToggleTheme}
              aria-label={isDark ? 'تفعيل الوضع الفاتح (نهار)' : 'تفعيل الوضع الداكن (هلال)'}
              title={isDark ? 'تغيير للوضع الفاتح (نهار)' : 'تغيير للوضع الداكن (هلال)'}
              className={`min-h-[38px] px-2.5 py-1 rounded-xl border flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                isDark
                  ? 'bg-[#161a26] border-white/15 text-amber-300 hover:bg-slate-800'
                  : 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200'
              }`}
            >
              {/* Crescent Moon Icon (علامة هلال - Dark Mode) */}
              <span
                className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${
                  isDark
                    ? 'bg-amber-400 text-slate-950 shadow-xs scale-105'
                    : 'text-slate-500'
                }`}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              </span>

              {/* Sun / Day Icon (علامة نهار - White / Light Mode) */}
              <span
                className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${
                  !isDark
                    ? 'bg-amber-400 text-slate-950 shadow-xs scale-105'
                    : 'text-slate-400'
                }`}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="4" fill="currentColor" />
                  <path d="M12 2v2" />
                  <path d="M12 20v2" />
                  <path d="m4.93 4.93 1.41 1.41" />
                  <path d="m17.66 17.66 1.41 1.41" />
                  <path d="M2 12h2" />
                  <path d="M20 12h2" />
                  <path d="m6.34 17.66-1.41 1.41" />
                  <path d="m19.07 4.93-1.41 1.41" />
                </svg>
              </span>
            </button>
          )}

          {showLogoutButton && (
            <div dir="ltr" className="shrink-0">
              <AnimatedLogoutButton
                variant={isDark ? 'dark' : 'light'}
                initialLabel="تسجيل الخروج"
                compact
                onLogoutComplete={onLogout}
              />
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

