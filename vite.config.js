import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
    base: process.env.VITE_BASE_PATH || '/',
    server: {
        host: true,
        headers: {
            'Permissions-Policy': 'fullscreen=(self)',
            'Cross-Origin-Opener-Policy': 'unsafe-none'
        },
        proxy: {
            '/SheetMusic_Viewer/api-proxy': {
                target: 'https://tanoqdnqtxqxerwcbdlf.supabase.co/storage/v1/object',
                changeOrigin: true,
                secure: false,
                rewrite: (path) => path.replace(/^\/SheetMusic_Viewer\/api-proxy/, '')
            }
        }
    },
    define: {
        __BUILD_TIME__: (() => {
            const now = new Date();
            const tpe = new Date(now.getTime() + 8 * 3600 * 1000);
            const p = n => String(n).padStart(2, '0');
            return JSON.stringify(`${tpe.getUTCFullYear()}/${p(tpe.getUTCMonth()+1)}/${p(tpe.getUTCDate())} ${p(tpe.getUTCHours())}:${p(tpe.getUTCMinutes())} (UTC+8)`);
        })(),
        __APP_BRANCH__: JSON.stringify(process.env.GITHUB_REF_NAME || process.env.GITHUB_HEAD_REF || 'local-dev'),
        __APP_MODE__: JSON.stringify(process.env.VITE_APP_MODE || 'current')
    },
    plugins: [
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['vite.svg', 'pdfjs/*.mjs'],
            manifest: {
                name: 'ScoreFlow Elite',
                short_name: 'ScoreFlow',
                description: 'Professional Offline SheetMusic Viewer',
                theme_color: '#6366f1',
                background_color: '#f8fafc',
                display: 'standalone',
                icons: [
                    {
                        src: 'vite.svg',
                        sizes: '192x192',
                        type: 'image/svg+xml'
                    }
                ]
            },
            workbox: {
                cleanupOutdatedCaches: true,
                globPatterns: ['**/*.{js,css,html,mjs,svg,bcmap,ttf,pfb,wasm}'],
                navigateFallback: null,
                runtimeCaching: [
                    {
                        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'google-fonts-stylesheets',
                            expiration: {
                                maxEntries: 10,
                                maxAgeSeconds: 60 * 60 * 24 * 365
                            }
                        }
                    }
                ]
            }
        })
    ]
})