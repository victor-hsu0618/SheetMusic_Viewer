import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
    base: '/SheetMusic_Viewer/',
    server: {
        host: true
    },
    define: {
        __BUILD_TIME__: JSON.stringify(new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })),
        __APP_BRANCH__: JSON.stringify(process.env.GITHUB_REF_NAME || 'local-dev')
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
                globPatterns: ['**/*.{js,css,html,mjs,svg}'],
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