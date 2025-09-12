
/* eslint-env node */
const path = require('path');
const webpack = require('webpack');

// Handle both export styles of the plugin
const TPPRaw = require('tsconfig-paths-webpack-plugin');
const TsconfigPathsPlugin = TPPRaw.TsconfigPathsPlugin || TPPRaw;
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
  mode: 'production',
  target: 'node20',
  context: __dirname, // important on Windows

  entry: path.resolve(__dirname, 'src/main.ts'),

  output: {
    path: path.resolve(__dirname, 'dist-bundle'),
    filename: 'main.js',
    clean: true,
  },

  resolve: {
    extensions: ['.ts', '.js'],
    plugins: [
      new TsconfigPathsPlugin({
        // point at the tsconfig that defines your "paths"
        configFile: path.resolve(__dirname, '../../tsconfig.json'),
        // optional but harmless: match exactly what you resolve
        extensions: ['.ts', '.js'],
      }),
    ],
    alias: {
      // class-transformer: point the subpath to the cjs file that actually exists
      'class-transformer/storage': require.resolve(
        'class-transformer/cjs/storage.js',
      ),
      'class-transformer/storage$': require.resolve('class-transformer/cjs/storage.js'),
      // nest websockets: stub out the optional module
      '@nestjs/websockets/socket-module': path.resolve(
        __dirname,
        'stubs/nop.js',
      ),
    },
    // if you have truly weird modules to point somewhere specific, you can add alias: { ... } here too
  },

  module: {
    rules: [
      {
        test: /\.ts$/,
        loader: 'ts-loader',
        options: {
          transpileOnly: true,          // faster; run `tsc --noEmit` separately in CI
          compilerOptions: { sourceMap: true, inlineSources: true }, // put TS sources into the map
        },
      },
      // If you import JS that already has a map, forward it
      { test: /\.js$/, enforce: 'pre', use: ['source-map-loader'] },
    ],
  },

  optimization: {
    // Keep class and function names so Nest logger contexts don’t become single letters
    minimize: true,
    minimizer: [
      new TerserPlugin({
        extractComments: false,
        terserOptions: {
          format: { comments: false },
          keep_classnames: true,
          keep_fnames: true,
          mangle: { keep_classnames: true, keep_fnames: true },
        },
      }),
    ],
  },

  plugins: [
    // Ignore optional transports you don't use in this build
    new webpack.IgnorePlugin({
      resourceRegExp:
        /^(amqp-connection-manager|amqplib|websockets|nats|mqtt|storage|pg-native|)$/,
    }),
  ],

  stats: { errorDetails: true },
};
