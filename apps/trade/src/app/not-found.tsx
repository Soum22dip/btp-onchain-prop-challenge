import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#08080F]">
      <div className="max-w-md w-full text-center">
        <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-8 shadow-2xl">
          <div className="inline-flex items-center gap-2 bg-[#7C3AED]/10 border border-[#7C3AED]/20 text-[#7C3AED] text-xs font-bold px-3 py-1 rounded-full mb-6">
            404
          </div>

          <h1 className="text-3xl font-bold text-white mb-3">This page doesn&apos;t exist</h1>
          <p className="text-white/40 text-sm mb-8 leading-relaxed">
            The page you&apos;re looking for isn&apos;t part of the trading terminal.
          </p>

          <Link
            href="/"
            className="w-full inline-block bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold py-3 rounded-lg transition-colors text-center"
          >
            Back to Terminal
          </Link>
        </div>
      </div>
    </div>
  );
}
