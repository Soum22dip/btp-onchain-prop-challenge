import React from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

export default function Footer() {
  return (
    <footer className="border-t border-border-setl8 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <img src="/logo_bgr.png" alt="Setl8" className="w-8 h-8" />
              <span className="text-xl font-black tracking-tight">
                <span className="text-white">SETL</span><span className="text-[#7C3AED]">8</span>
              </span>
            </div>
            <p className="text-text-secondary text-sm max-w-xs leading-relaxed">
              The world&apos;s first onchain DeFi prop firm built on Solana.
              Trade synthetic markets and get funded — all verified onchain.
            </p>
          </div>

          {/* Platform links */}
          <div>
            <h3 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">Platform</h3>
            <ul className="space-y-2.5">
              {[
                { href: '/challenge', label: 'Buy Challenge' },
                { href: '/dashboard', label: 'Dashboard' },
                { href: '/vault', label: 'Vault' },
                { href: '/leaderboard', label: 'Leaderboard' },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-text-secondary hover:text-white text-sm transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Onchain */}
          <div>
            <h3 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">Onchain</h3>
            <ul className="space-y-2.5">
              <li>
                <a
                  href="https://solscan.io/account/BMHggqxZUgjMEwev5z8YDbFsd6LvTFdZu2SB7B4n7Z1e?cluster=devnet"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-text-secondary hover:text-white text-sm transition-colors"
                >
                  Payout Vault
                  <ExternalLink className="w-3 h-3" />
                </a>
              </li>
              <li>
                <a
                  href="https://solana.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-text-secondary hover:text-white text-sm transition-colors"
                >
                  Built on Solana
                  <ExternalLink className="w-3 h-3" />
                </a>
              </li>
              <li>
                <a
                  href="https://pyth.network"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-text-secondary hover:text-white text-sm transition-colors"
                >
                  Powered by Pyth
                  <ExternalLink className="w-3 h-3" />
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 pt-6 border-t border-border-setl8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-text-muted text-xs">
            &copy; {new Date().getFullYear()} Setl8. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <span className="text-text-muted text-xs">Devnet — Trading is synthetic, not real</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
