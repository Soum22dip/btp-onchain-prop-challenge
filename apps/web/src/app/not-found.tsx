import Link from 'next/link';

export default function NotFound() {
  const tradeUrl = process.env.NODE_ENV === 'development' ? 'http://localhost:3002' : 'https://trade.setl8.com';

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#08080F]">
      <div className="max-w-md w-full text-center">
        <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-8 shadow-2xl">
          {/* 404 badge */}
          <div className="inline-flex items-center gap-2 bg-[#7C3AED]/10 border border-[#7C3AED]/20 text-[#7C3AED] text-xs font-bold px-3 py-1 rounded-full mb-6">
            404
          </div>

          <h1 className="text-3xl font-bold text-white mb-3">Page Not Found</h1>
          <p className="text-white/40 text-sm mb-8 leading-relaxed">
            This page doesn&apos;t exist or has been moved. Let&apos;s get you back on track.
          </p>

          <div className="flex flex-col gap-3">
            <Link
              href="/"
              className="w-full inline-block bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold py-3 rounded-lg transition-colors text-center"
            >
              Go Home
            </Link>
            <a
              href={tradeUrl}
              className="w-full inline-block bg-white/[0.04] hover:bg-white/[0.08] text-white/60 hover:text-white font-medium py-3 rounded-lg transition-colors text-center"
            >
              Start Trading
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
