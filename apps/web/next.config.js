/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Désactiver ESLint pendant la construction pour Docker
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Désactiver les erreurs TypeScript pendant la construction pour Docker
    ignoreBuildErrors: true,
  },
}

module.exports = nextConfig