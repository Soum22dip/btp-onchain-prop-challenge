import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#08080F]">
      <div className="max-w-md w-full text-center">
        <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-8 shadow-2xl">
          <div className="inline-flex items-center gap-2 bg-[#EF4444]/10 border border-[#EF4444]/20 text-[#EF4444] text-xs font-bold px-3 py-1 rounded-full mb-6">
            404
          </div>

          <h1 className="text-3xl font-bold text-white mb-3">Page Not Found</h1>
          <p className="text-white/40 text-sm mb-8 leading-relaxed">
            This admin page doesn&apos;t exist.
          </p>

          <Link
            href="/overview"
            className="w-full inline-block bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold py-3 rounded-lg transition-colors text-center"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
