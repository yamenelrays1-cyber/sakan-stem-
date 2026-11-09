import React from 'react';
import { SESSION_STATUS_STEPS, type SessionStatus } from '../types/orders';
import {
  getNextSessionStatusActionLabelAr,
  getSessionStatusLabelAr,
} from '../utils/orderAggregator';

interface SessionStatusStepperProps {
  status: SessionStatus;
  isSupervisor: boolean;
  onAdvanceStatus: () => void;
  onOpenSummaryModal: () => void;
  totalItemsCount: number;
  isFirebaseConnected?: boolean;
  onConnectFirebase?: () => void;
}

export const SessionStatusStepper: React.FC<SessionStatusStepperProps> = ({
  status,
  isSupervisor,
  onAdvanceStatus,
  onOpenSummaryModal,
  totalItemsCount,
  isFirebaseConnected = false,
  onConnectFirebase,
}) => {
  const activeStepIndex = SESSION_STATUS_STEPS.findIndex((s) => s.key === status);
  const progressPercent =
    activeStepIndex === 0 ? 33.33 : activeStepIndex === 1 ? 66.66 : 100;

  return (
    <section
      id="session-status-stepper"
      dir="rtl"
      aria-label="شريط تقدم حالة جلسة الطلب"
      className="bg-white border-b border-slate-200 px-4 sm:px-8 py-3"
    >
      <div className="max-w-5xl mx-auto space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`px-3 py-1 rounded-xl text-xs font-extrabold border inline-flex items-center gap-1.5 transition-colors ${
                status === 'open'
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs'
                  : status === 'sent'
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-xs'
                    : 'bg-sky-600 text-white border-sky-500 shadow-xs'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  status === 'open'
                    ? 'bg-white animate-pulse'
                    : status === 'sent'
                      ? 'bg-slate-950'
                      : 'bg-white animate-pulse'
                }`}
              />
              <span>
                {status === 'open' && 'مفتوح'}
                {status === 'sent' && 'اتبعت'}
                {status === 'arrived' && 'وصل'}
              </span>
            </span>
          </div>

          {isSupervisor && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                id="open-order-summary-modal-btn"
                type="button"
                onClick={onOpenSummaryModal}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-xs"
              >
                <span>📋 ملخص الطلب</span>
                {totalItemsCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-md bg-slate-950/15 text-[11px] font-mono tabular-nums">
                    {totalItemsCount}
                  </span>
                )}
              </button>

              <button
                id="supervisor-advance-status-btn"
                type="button"
                onClick={onAdvanceStatus}
                className="min-h-[38px] px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold transition-colors cursor-pointer shadow-xs"
              >
                {getNextSessionStatusActionLabelAr(status)}
              </button>
            </div>
          )}
        </div>

        {/* Simple Progress Bar & 3 Stages (مفتوح -> اتبعت -> وصل) */}
        <div className="space-y-1.5">
          <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden border border-slate-200/70">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                status === 'open'
                  ? 'bg-emerald-500'
                  : status === 'sent'
                    ? 'bg-amber-500'
                    : 'bg-sky-500'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="grid grid-cols-3 gap-2 pt-0.5">
            {SESSION_STATUS_STEPS.map((step, index) => {
              const isCompleted = index <= activeStepIndex;
              const isCurrent = step.key === status;
              return (
                <div
                  key={step.key}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-right transition-colors ${
                    isCurrent
                      ? step.key === 'open'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                        : step.key === 'sent'
                          ? 'bg-amber-50 border-amber-300 text-amber-950'
                          : 'bg-sky-50 border-sky-300 text-sky-950'
                      : isCompleted
                        ? 'bg-slate-50 border-slate-300 text-slate-800'
                        : 'bg-white border-slate-200 text-slate-400'
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-extrabold font-mono shrink-0 ${
                      isCurrent
                        ? 'bg-slate-900 text-white'
                        : isCompleted
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-extrabold leading-tight">
                      {getSessionStatusLabelAr(step.key)}
                    </div>
                    <div className="text-[10px] opacity-80 truncate hidden sm:block">
                      {step.shortDescAr}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
