'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuthStore } from '@/store/auth';
import { getAdminStats, setAdminSecret } from '@/lib/api';
import { Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { setSecret } = useAdminAuthStore();
  const [secretInput, setSecretInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secretInput.trim()) return;

    setLoading(true);
    setError(null);

    // Temporarily set the secret in the API layer for the test call
    setAdminSecret(secretInput.trim());

    try {
      await getAdminStats();
      // If succeeded, persist to store and redirect
      setSecret(secretInput.trim());
      router.push('/overview');
    } catch (err: unknown) {
      // Clear the temporary secret
      setAdminSecret('');
      if (
        err instanceof Error &&
        'status' in err &&
        ((err as { status: number }).status === 401 ||
          (err as { status: number }).status === 403)
      ) {
        setError('Invalid admin secret');
      } else {
        setError('Failed to connect. Check if the backend is running.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="w-full max-w-sm bg-surface border border-border-setl8 rounded-xl p-8">
        <div className="mb-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <img src="/logo_bgr.png" alt="Setl8" className="w-7 h-7" />
            <h1 className="text-xl font-bold tracking-widest">
              <span className="text-white">SETL</span><span className="text-[#7C3AED]">8</span>
              <span className="text-white"> ADMIN</span>
            </h1>
          </div>
          <p className="text-text-secondary text-sm">
            Internal dashboard — restricted access
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              value={secretInput}
              onChange={(e) => setSecretInput(e.target.value)}
              placeholder="Admin secret"
              className="w-full bg-background border border-border-setl8 rounded-lg px-4 py-3 text-white placeholder-text-muted focus:outline-none focus:border-primary text-sm"
              autoFocus
              disabled={loading}
            />
          </div>

          {error && (
            <p className="text-danger text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !secretInput.trim()}
            className="w-full bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Verifying...
              </>
            ) : (
              'Enter Dashboard'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
