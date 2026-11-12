/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@setl8/types',
    '@setl8/constants',
    '@solana/wallet-adapter-base',
    '@solana/wallet-adapter-react',
    '@solana/wallet-adapter-react-ui',
    '@solana/wallet-adapter-wallets',
  ],
};
export default nextConfig;
