export default function Loading() {
  return (
    <div className="min-h-screen bg-[#08080F]">
      {/* Navbar placeholder */}
      <div className="h-16 border-b border-white/[0.04]" />

      {/* Content area */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero skeleton */}
        <div className="text-center mb-12 animate-pulse">
          <div className="h-6 w-32 bg-white/[0.04] rounded-full mx-auto mb-6" />
          <div className="h-10 w-96 max-w-full bg-white/[0.04] rounded-lg mx-auto mb-4" />
          <div className="h-5 w-64 bg-white/[0.03] rounded-lg mx-auto" />
        </div>

        {/* Cards skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-5">
              <div className="h-3 w-16 bg-white/[0.04] rounded mb-3" />
              <div className="h-7 w-20 bg-white/[0.04] rounded" />
            </div>
          ))}
        </div>

        {/* Content rows skeleton */}
        <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl overflow-hidden animate-pulse">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-white/[0.03]">
              <div className="w-8 h-8 rounded-full bg-white/[0.04]" />
              <div className="flex-1 h-4 bg-white/[0.04] rounded" />
              <div className="w-20 h-4 bg-white/[0.04] rounded" />
              <div className="w-16 h-4 bg-white/[0.03] rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
