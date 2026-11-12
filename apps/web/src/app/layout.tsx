import type { Metadata, Viewport } from 'next';
import '@solana/wallet-adapter-react-ui/styles.css';
import './globals.css';
import Providers from '@/components/providers/Providers';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';

export const metadata: Metadata = {
  title: {
    default: 'Setl8 — Onchain DeFi Prop Firm on Solana',
    template: '%s | Setl8',
  },
  description:
    'The world\'s first onchain DeFi prop firm built on Solana. Trade synthetic markets, prove your skills, and get funded — all verified onchain.',
  keywords: ['DeFi', 'Solana', 'prop firm', 'trading', 'crypto', 'synthetic trading'],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://setl8.com',
    siteName: 'Setl8',
    title: 'Setl8 — Onchain DeFi Prop Firm on Solana',
    description: 'Trade synthetic markets and get funded onchain.',
  },
  twitter: {
    card: 'summary_large_image',
  },
  icons: {
    icon: '/favicon.png',
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#08080F',
  width: 'device-width',
  initialScale: 1,
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="bg-background text-white antialiased">
        <Providers>
          <Navbar />
          <main className="min-h-screen pt-16">
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
