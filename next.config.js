/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Set output directory for production build
  distDir: 'out',
  // Export as static HTML for Electron
  output: 'export',
};

module.exports = nextConfig; 