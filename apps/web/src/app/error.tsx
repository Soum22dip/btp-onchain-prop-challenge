'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Setl8] Unhandled error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#08080F]">
      <div className="max-w-md w-full text-center">
        {/* Glass card */}
        <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-8 shadow-2xl">
          {/* Icon */}
          <div className="w-16 h-16 rounded-2xl bg-[#EF4444]/10 border border-[#EF4444]/20 flex items-center justify-center mx-auto mb-6">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-white mb-2">Something went wrong</h1>
          <p className="text-white/40 text-sm mb-8 leading-relaxed">
            An unexpected error occurred. Please try again or contact support if the problem persists.
          </p>

          {/* Error digest for debugging */}
          {error.digest && (
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 mb-6">
              <span className="text-[10px] text-white/25 font-mono">Error ID: {error.digest}</span>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <button
              onClick={reset}
              className="w-full bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold py-3 rounded-lg transition-colors"
            >
              Try Again
            </button>
            <a
              href="/"
              className="w-full inline-block bg-white/[0.04] hover:bg-white/[0.08] text-white/60 hover:text-white font-medium py-3 rounded-lg transition-colors text-center"
            >
              Go Home
            </a>
          </div>
        </div>

        {/* Branding */}
        <div className="mt-6 flex items-center justify-center gap-2">
          <div className="w-5 h-5 rounded bg-[#7C3AED]/20 flex items-center justify-center">
            <span className="text-[#7C3AED] font-bold text-[9px]">S8</span>
          </div>
          <span className="text-white/15 text-xs font-medium tracking-wider">SETL8</span>
        </div>
      </div>
    </div>
  );
}
