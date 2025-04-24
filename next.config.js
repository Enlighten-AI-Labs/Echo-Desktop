/** @type {import('next').NextConfig} */
const webpack = require('webpack');

const nextConfig = {
  reactStrictMode: true,
  // Set output directory for production build
  distDir: 'out',
  // Export as static HTML for Electron
  output: 'export',
  // Disable image optimization since we're running locally
  images: {
    unoptimized: true,
    domains: ['localhost'],
    remotePatterns: [],
  },
  // Webpack configuration for Electron
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.target = 'web';
      
      // Provide global object for renderer process
      config.output.globalObject = 'globalThis';

      // Add Node.js polyfills
      config.plugins.push(
        new webpack.ProvidePlugin({
          process: 'process/browser',
          Buffer: ['buffer', 'Buffer'],
          global: ['globalThis'],
        })
      );
      
      // Handle Node.js modules
      config.resolve.fallback = {
        ...config.resolve.fallback,
        path: false,
        fs: false,
        process: require.resolve('process/browser'),
        buffer: require.resolve('buffer/'),
        util: require.resolve('util/'),
        stream: require.resolve('stream-browserify'),
        crypto: require.resolve('crypto-browserify'),
      };
    }
    
    // Add ESM support
    config.resolve.extensionAlias = {
      '.js': ['.js', '.ts', '.tsx'],
      '.jsx': ['.jsx', '.tsx']
    };

    // Handle static file imports including fonts
    config.module.rules.push(
      {
        test: /\.(png|jpg|gif|svg|ico)$/i,
        type: 'asset/resource',
        generator: {
          filename: 'static/images/[name][ext]',
          publicPath: './',
        },
      },
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/i,
        type: 'asset/resource',
        generator: {
          filename: 'static/fonts/[name][ext]',
          publicPath: './',
        },
      }
    );

    return config;
  },
  // Ensure pages are exported correctly
  trailingSlash: false,
  // Configure static file serving
  assetPrefix: '.',
};

module.exports = nextConfig; 