'use client';

import { useEffect, useState } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const isDev = process.env.NODE_ENV === 'development';

  useEffect(() => {
    console.error('[Setl8 Trade] Terminal error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#08080F]">
      <div className="max-w-lg w-full text-center">
        <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-8 shadow-2xl">
          {/* Icon */}
          <div className="w-16 h-16 rounded-2xl bg-[#EF4444]/10 border border-[#EF4444]/20 flex items-center justify-center mx-auto mb-6">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-white mb-2">Trading Terminal Error</h1>
          <p className="text-white/40 text-sm mb-6 leading-relaxed">
            The trading terminal encountered an unexpected error. Your positions are safe — reload to reconnect.
          </p>

          {/* Dev-only error details */}
          {isDev && (
            <div className="mb-6">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="text-[11px] text-white/30 hover:text-white/50 transition-colors flex items-center gap-1 mx-auto"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={`transition-transform ${showDetails ? 'rotate-90' : ''}`}
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                {showDetails ? 'Hide' : 'Show'} error details
              </button>
              {showDetails && (
                <div className="mt-3 bg-black/30 border border-white/[0.06] rounded-lg p-3 text-left overflow-auto max-h-48">
                  <p className="text-[11px] text-[#EF4444] font-mono break-all">{error.message}</p>
                  {error.stack && (
                    <pre className="text-[9px] text-white/20 font-mono mt-2 whitespace-pre-wrap break-all">
                      {error.stack}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}

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
              Reload Terminal
            </button>
            <a
              href="/"
              className="w-full inline-block bg-white/[0.04] hover:bg-white/[0.08] text-white/60 hover:text-white font-medium py-3 rounded-lg transition-colors text-center"
            >
              Return to Terminal
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
