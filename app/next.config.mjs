/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  // Scoresheet photos arrive as data URLs; the client shrinks them to about 1 MB.
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
};
export default nextConfig;
