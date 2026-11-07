/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  // Scoresheet photos arrive as data URLs; the client shrinks them to about 1 MB.
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  // The service worker must always be re-checked so cache fixes reach every browser.
  async headers() {
    return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] }];
  },
};
export default nextConfig;
