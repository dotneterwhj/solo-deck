/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['ssh2'],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
