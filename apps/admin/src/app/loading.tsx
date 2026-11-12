export default function Loading() {
  return (
    <div className="flex h-screen bg-[#08080F]">
      {/* Sidebar placeholder */}
      <div className="w-[240px] border-r border-white/[0.04] flex-shrink-0 animate-pulse hidden md:block">
        <div className="flex items-center gap-3 px-5 py-5 border-b border-white/[0.04]">
          <div className="w-8 h-8 rounded-lg bg-[#7C3AED]/10" />
          <div className="h-5 w-20 bg-white/[0.04] rounded" />
        </div>
        <div className="p-3 space-y-1">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5">
              <div className="w-4 h-4 rounded bg-white/[0.04]" />
              <div className="h-3.5 flex-1 bg-white/[0.03] rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-6 animate-pulse">
        {/* Page header */}
        <div className="mb-8">
          <div className="h-7 w-48 bg-white/[0.04] rounded mb-2" />
          <div className="h-4 w-72 bg-white/[0.03] rounded" />
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-5">
              <div className="h-3 w-20 bg-white/[0.04] rounded mb-3" />
              <div className="h-8 w-24 bg-white/[0.04] rounded mb-1" />
              <div className="h-3 w-16 bg-white/[0.03] rounded" />
            </div>
          ))}
        </div>

        {/* Table skeleton */}
        <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-white/[0.04] flex gap-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-3 flex-1 bg-white/[0.03] rounded" />
            ))}
          </div>
          {[...Array(8)].map((_, i) => (
            <div key={i} className="px-5 py-3.5 border-b border-white/[0.03] flex gap-4">
              {[...Array(5)].map((_, j) => (
                <div key={j} className="h-4 flex-1 bg-white/[0.03] rounded" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
