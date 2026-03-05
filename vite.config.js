import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
    base: '/SheetMusic_Viewer/',
    server: {
        host: true
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
                globPatterns: ['**/*.{js,css,html,mjs,svg,pdf}'],
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
                    },
                    {
                        urlPattern: /\/demo\/.*\.pdf$/,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'demo-pdf',
                            expiration: {
                                maxEntries: 2,
                                maxAgeSeconds: 60 * 60 * 24 * 30
                            }
                        }
                    }
                ]
            }
        })
    ]
})