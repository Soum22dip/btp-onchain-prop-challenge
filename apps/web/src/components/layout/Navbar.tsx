'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { LogOut, Wallet, ChevronDown, Menu, X, Shield, Trophy, LayoutDashboard } from 'lucide-react';
import { cn, truncateAddress } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { motion, AnimatePresence } from 'framer-motion';

// ---------------------------------------------------------------------------
// Navigation links
// ---------------------------------------------------------------------------

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, authRequired: true, needsAttempts: true },
  { href: '/vault', label: 'Vault', icon: Shield, authRequired: false, needsAttempts: false },
  { href: '/leaderboard', label: 'Leaderboard', icon: Trophy, authRequired: false, needsAttempts: false },
] as const;

// ---------------------------------------------------------------------------
// Navbar
// ---------------------------------------------------------------------------

export default function Navbar() {
  const pathname = usePathname();
  const { setVisible } = useWalletModal();
  const { isAuthenticated, trader, walletConnected, walletAddress, signIn, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleConnectWallet = () => {
    setVisible(true);
  };

  const handleSignIn = async () => {
    setIsSigningIn(true);
    try {
      await signIn();
    } catch (err) {
      console.error('Sign in failed:', err);
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border-setl8 bg-background/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 relative">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <img src="/logo_bgr.png" alt="Setl8" className="w-8 h-8" />
            <span className="text-xl font-black tracking-tight">
              <span className="text-white">SETL</span><span className="text-[#7C3AED]">8</span>
            </span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
            {NAV_LINKS.map((link) => {
              if (link.authRequired && !isAuthenticated) return null;
              if (link.needsAttempts && (!trader || !trader.totalAttempts || trader.totalAttempts <= 0)) return null;
              const isActive = pathname === link.href || pathname.startsWith(link.href + '/');
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-text-secondary hover:text-white hover:bg-surface',
                  )}
                >
                  <link.icon className="w-4 h-4" />
                  {link.label}
                </Link>
              );
            })}
          </div>

          {/* Right side: wallet / auth */}
          <div className="hidden md:flex items-center gap-3">
            {!walletConnected ? (
              <button onClick={handleConnectWallet} className="btn-primary flex items-center gap-2 text-sm">
                <Wallet className="w-4 h-4" />
                Connect Wallet
              </button>
            ) : !isAuthenticated ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-secondary bg-surface border border-border-setl8 px-3 py-1.5 rounded-lg">
                  {truncateAddress(walletAddress ?? '')}
                </span>
                <button
                  onClick={handleSignIn}
                  disabled={isSigningIn}
                  className="btn-primary text-sm disabled:opacity-50"
                >
                  {isSigningIn ? 'Signing...' : 'Sign In'}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 bg-surface border border-border-setl8 px-3 py-1.5 rounded-lg">
                  <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                  <span className="text-sm text-white font-medium">
                    {truncateAddress(walletAddress ?? '')}
                  </span>
                </div>
                {trader && (
                  <Link
                    href="/challenge"
                    className="btn-primary text-sm"
                  >
                    Buy Challenge
                  </Link>
                )}
                <button
                  onClick={signOut}
                  className="btn-ghost text-sm flex items-center gap-1.5"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 rounded-lg hover:bg-surface text-text-secondary hover:text-white transition-colors"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden border-t border-border-setl8 bg-background overflow-hidden"
          >
            <div className="p-4 space-y-2">
              {NAV_LINKS.map((link) => {
                if (link.authRequired && !isAuthenticated) return null;
                if (link.needsAttempts && (!trader || !trader.totalAttempts || trader.totalAttempts <= 0)) return null;
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      'flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-text-secondary hover:text-white hover:bg-surface',
                    )}
                  >
                    <link.icon className="w-4 h-4" />
                    {link.label}
                  </Link>
                );
              })}

              <div className="pt-2 border-t border-border-setl8">
                {!walletConnected ? (
                  <button onClick={handleConnectWallet} className="btn-primary w-full flex items-center justify-center gap-2 text-sm">
                    <Wallet className="w-4 h-4" />
                    Connect Wallet
                  </button>
                ) : !isAuthenticated ? (
                  <button onClick={handleSignIn} disabled={isSigningIn} className="btn-primary w-full text-sm disabled:opacity-50">
                    {isSigningIn ? 'Signing...' : 'Sign In'}
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 px-4 py-2 bg-surface rounded-lg">
                      <div className="w-2 h-2 rounded-full bg-success" />
                      <span className="text-sm text-white">{truncateAddress(walletAddress ?? '')}</span>
                    </div>
                    <button onClick={() => { signOut(); setMenuOpen(false); }} className="w-full btn-ghost text-sm flex items-center justify-center gap-1.5">
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
