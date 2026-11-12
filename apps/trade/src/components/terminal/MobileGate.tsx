'use client';

// ---------------------------------------------------------------------------
// MobileGate — shown on screens < 768px
// ---------------------------------------------------------------------------

export function MobileGate() {
  return (
    <div className="flex md:hidden flex-col items-center justify-center h-screen bg-[#08080F] px-6 text-center gap-6">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <span className="text-2xl font-bold tracking-wider text-white">SETL8</span>
        <span className="text-[10px] font-semibold tracking-widest text-white/40 bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 rounded-md">
          TRADE
        </span>
      </div>

      {/* Icon */}
      <div className="w-16 h-16 rounded-2xl bg-[#7C3AED]/10 border border-[#7C3AED]/20 flex items-center justify-center">
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#7C3AED"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8" />
          <path d="M12 17v4" />
        </svg>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-white">
          Trading is best on desktop
        </h2>
        <p className="text-sm text-white/40 max-w-xs">
          The Setl8 trading terminal requires a larger screen for the best experience.
          Use a desktop or tablet in landscape mode.
        </p>
      </div>

      <a
        href="http://setl8.com"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 px-6 py-2.5 bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-semibold rounded-lg transition-colors shadow-lg shadow-purple-500/20"
      >
        Visit setl8.com
      </a>
    </div>
  );
}
