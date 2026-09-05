import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
            // Resolve the shared workspace package to its TypeScript source so Vite
            // bundles it directly instead of Rollup's fragile CJS interop.
            '@ledgerguard/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
        },
    },
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:4000',
                changeOrigin: true,
            },
            // Forward Socket.IO handshake + upgrades so realtime events reach the backend in dev.
            '/socket.io': {
                target: 'http://127.0.0.1:4000',
                changeOrigin: true,
                ws: true,
                secure: false,
            },
        },
    },
    build: {
        outDir: 'dist',
        sourcemap: false,
        rollupOptions: {
            output: {
                /**
                 * Vendor chunk splitting (Phase 4, Part 48):
                 * - Keeps each initial-load chunk below the 500 kB Rollup warning
                 * - Long-term caching: vendor hashes change only when deps change
                 * - Parallel fetch of independent vendor chunks
                 * Analytics pages stay route-level lazy via React.lazy.
                 */
                manualChunks: function (id) {
                    if (!id.includes('node_modules'))
                        return undefined;
                    if (id.includes('react-dom') || id.match(/[\\/]node_modules[\\/]react[\\/]/) || id.includes('scheduler')) {
                        return 'react-vendor';
                    }
                    if (id.includes('react-router'))
                        return 'router';
                    if (id.includes('framer-motion'))
                        return 'motion';
                    if (id.includes('socket.io-client') || id.includes('engine.io-client'))
                        return 'realtime';
                    if (id.includes('@tanstack') || id.includes('axios'))
                        return 'data';
                    if (id.includes('lucide-react') || id.includes('zustand'))
                        return 'ui';
                    return 'vendors-misc';
                },
            },
        },
    },
});
