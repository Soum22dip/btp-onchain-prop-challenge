'use client';

import { useEffect, useState } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [showStack, setShowStack] = useState(false);
  const isDev = process.env.NODE_ENV === 'development';

  useEffect(() => {
    console.error('[Setl8 Admin] Dashboard error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#08080F]">
      <div className="max-w-lg w-full text-center">
        <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-8 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-[#EF4444]/10 border border-[#EF4444]/20 flex items-center justify-center mx-auto mb-6">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="9" y1="9" x2="15" y2="15" />
              <line x1="15" y1="9" x2="9" y2="15" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-white mb-2">Dashboard Error</h1>
          <p className="text-white/40 text-sm mb-6 leading-relaxed">
            The admin dashboard encountered an error. This has been logged for investigation.
          </p>

          {/* Always show error message in admin */}
          <div className="bg-[#EF4444]/5 border border-[#EF4444]/10 rounded-lg px-4 py-3 mb-4 text-left">
            <p className="text-[12px] text-[#EF4444] font-mono break-all">{error.message}</p>
          </div>

          {/* Full stack in dev mode */}
          {isDev && error.stack && (
            <div className="mb-6">
              <button
                onClick={() => setShowStack(!showStack)}
                className="text-[11px] text-white/30 hover:text-white/50 transition-colors flex items-center gap-1 mx-auto"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={`transition-transform ${showStack ? 'rotate-90' : ''}`}
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                {showStack ? 'Hide' : 'Show'} stack trace
              </button>
              {showStack && (
                <pre className="mt-3 bg-black/40 border border-white/[0.06] rounded-lg p-3 text-left text-[9px] text-white/25 font-mono whitespace-pre-wrap break-all overflow-auto max-h-64">
                  {error.stack}
                </pre>
              )}
            </div>
          )}

          {error.digest && (
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 mb-6">
              <span className="text-[10px] text-white/25 font-mono">Digest: {error.digest}</span>
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
              href="/overview"
              className="w-full inline-block bg-white/[0.04] hover:bg-white/[0.08] text-white/60 hover:text-white font-medium py-3 rounded-lg transition-colors text-center"
            >
              Back to Dashboard
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
