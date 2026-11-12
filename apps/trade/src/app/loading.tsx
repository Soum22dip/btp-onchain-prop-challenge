export default function Loading() {
  return (
    <div className="h-screen w-screen bg-[#08080F] flex flex-col overflow-hidden">
      {/* Top bar placeholder */}
      <div className="h-12 border-b border-white/[0.04] flex items-center px-4 gap-3 animate-pulse">
        <div className="w-6 h-6 rounded bg-[#7C3AED]/20" />
        <div className="h-4 w-24 bg-white/[0.04] rounded" />
        <div className="flex-1" />
        <div className="h-8 w-32 bg-white/[0.04] rounded-lg" />
      </div>

      {/* Main terminal area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar placeholder */}
        <div className="w-[200px] border-r border-white/[0.04] p-3 animate-pulse hidden md:block">
          <div className="h-8 bg-white/[0.04] rounded-lg mb-3" />
          <div className="space-y-1">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-2">
                <div className="w-4 h-4 rounded bg-white/[0.04]" />
                <div className="flex-1 h-3 bg-white/[0.03] rounded" />
                <div className="w-12 h-3 bg-white/[0.04] rounded" />
              </div>
            ))}
          </div>
        </div>

        {/* Chart area */}
        <div className="flex-1 flex flex-col">
          {/* Timeframe bar */}
          <div className="h-9 border-b border-white/[0.04] flex items-center px-3 gap-2 animate-pulse">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="w-8 h-5 bg-white/[0.04] rounded" />
            ))}
          </div>

          {/* Chart placeholder */}
          <div className="flex-1 relative animate-pulse">
            <div className="absolute inset-4 bg-white/[0.02] border border-white/[0.04] rounded-xl" />
          </div>

          {/* Positions placeholder */}
          <div className="h-36 border-t border-white/[0.04] animate-pulse p-3">
            <div className="h-4 w-24 bg-white/[0.04] rounded mb-3" />
            <div className="h-8 bg-white/[0.03] rounded mb-2" />
            <div className="h-8 bg-white/[0.02] rounded" />
          </div>
        </div>

        {/* Order form placeholder */}
        <div className="w-[240px] border-l border-white/[0.04] p-3 animate-pulse hidden lg:block">
          <div className="h-4 w-20 bg-white/[0.04] rounded mb-3" />
          <div className="h-10 bg-[#7C3AED]/10 rounded-lg mb-3" />
          <div className="flex gap-2 mb-4">
            <div className="flex-1 h-10 bg-[#2563EB]/10 rounded-lg" />
            <div className="flex-1 h-10 bg-white/[0.03] rounded-lg" />
          </div>
          <div className="space-y-3">
            <div className="h-5 bg-white/[0.04] rounded" />
            <div className="h-8 bg-white/[0.03] rounded" />
            <div className="grid grid-cols-4 gap-1.5">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-7 bg-white/[0.03] rounded" />
              ))}
            </div>
            <div className="h-10 bg-white/[0.04] rounded-lg" />
          </div>
          <div className="mt-4 h-12 bg-[#2563EB]/20 rounded-lg" />
        </div>
      </div>

      {/* Account bar placeholder */}
      <div className="h-10 border-t border-white/[0.04] flex items-center px-4 gap-6 animate-pulse">
        <div className="h-4 w-20 bg-white/[0.04] rounded" />
        <div className="h-4 w-28 bg-white/[0.04] rounded" />
        <div className="flex-1" />
        <div className="h-4 w-32 bg-white/[0.04] rounded" />
      </div>
    </div>
  );
}
