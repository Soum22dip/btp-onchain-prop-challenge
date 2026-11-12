import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  swcMinify: true,
  transpilePackages: [
    '@setl8/types',
    '@setl8/constants',
    '@solana/wallet-adapter-base',
    '@solana/wallet-adapter-react',
    '@solana/wallet-adapter-react-ui',
    '@solana/wallet-adapter-wallets',
  ],
  webpack(config) {
    // Force a single copy of wallet-adapter-react so WalletContext is shared
    // across all packages (prevents "WalletContext without providing one" error
    // caused by pnpm resolving multiple copies with different peer deps).
    config.resolve.alias = {
      ...config.resolve.alias,
      '@solana/wallet-adapter-react': resolve(
        __dirname,
        '../../node_modules/@solana/wallet-adapter-react',
      ),
    };
    return config;
  },
};
export default nextConfig;
