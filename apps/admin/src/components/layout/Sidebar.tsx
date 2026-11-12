'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  Users,
  DollarSign,
  AlertTriangle,
  Shield,
  ShoppingCart,
  Activity,
  LogOut,
} from 'lucide-react';
import { useAdminAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Overview', href: '/overview', icon: LayoutDashboard },
  { label: 'Traders', href: '/traders', icon: Users },
  { label: 'Challenge Sales', href: '/sales', icon: ShoppingCart },
  { label: 'Payouts', href: '/payouts', icon: DollarSign },
  { label: 'Vault Health', href: '/vault', icon: Shield },
  { label: 'Market Monitor', href: '/market', icon: Activity },
  { label: 'Fraud Flags', href: '/fraud', icon: AlertTriangle },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void } = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const clearSecret = useAdminAuthStore((s) => s.clearSecret);

  const handleSignOut = () => {
    clearSecret();
    router.push('/login');
  };

  return (
    <aside className="w-[240px] h-full flex flex-col border-r border-border-setl8 bg-surface flex-shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-border-setl8">
        <img src="/logo_bgr.png" alt="Setl8" className="w-8 h-8" />
        <div className="flex items-center gap-2">
          <span className="font-bold text-lg tracking-wider">
            <span className="text-white">SETL</span><span className="text-[#7C3AED]">8</span>
          </span>
          <span className="bg-danger/20 text-danger text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
            ADMIN
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 space-y-0.5 px-2 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-primary/10 text-white shadow-sm'
                  : 'text-text-secondary hover:text-white hover:bg-white/[0.03]',
              )}
            >
              <Icon size={16} className={isActive ? 'text-primary' : ''} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border-setl8 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-success dot-pulse flex-shrink-0" />
          <span className="text-text-secondary text-xs">Connected to backend</span>
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 text-text-secondary hover:text-white text-xs transition-colors w-full"
        >
          <LogOut size={14} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
