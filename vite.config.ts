import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from 'vite-plugin-pwa';
import { sentryVitePlugin } from "@sentry/vite-plugin";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8099,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(), 
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'Saudade — Gestión Clínica Profesional',
        short_name: 'Saudade',
        description: 'Plataforma de gestión clínica con inteligencia artificial, notas clínicas y expedientes médicos.',
        lang: 'es',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 5000000,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/\/api\//, /\/auth\//],
        runtimeCaching: [
          {
            // Estrategia Network-First para /api/* y Supabase: Garantiza que los cobros, citas y agenda siempre se consulten en tiempo real sin mostrar datos desactualizados.
            urlPattern: ({ url }) => url.pathname.startsWith('/api') || url.hostname.includes('supabase.co'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-realtime-cache',
              networkTimeoutSeconds: 10,
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            // Estrategia Network-First con fallback: Para la navegación HTML en la plataforma
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'html-pages-cache',
              networkTimeoutSeconds: 3
            }
          },
          {
            // Estrategia Cache-First: Para tipografías de Google Fonts
            urlPattern: new RegExp('^https://fonts\\.(?:googleapis|gstatic)\\.com/.*', 'i'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 año
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            // Estrategia Cache-First: Para librerías CDN externas
            urlPattern: new RegExp('^https://(?:cdn\\.jsdelivr\\.net|cdnjs\\.cloudflare\\.com|esm\\.sh|accounts\\.google\\.com)/.*', 'i'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'cdn-libs-cache',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 días
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            // Estrategia Cache-First: Para iconos e imágenes
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|avif|ico)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 días
              }
            }
          }
        ]
      }
    }),
    sentryVitePlugin({
      org: "saudade", // Set your Sentry organization slug here
      project: "mindful-flow", // Set your Sentry project slug here
      // Auth token from your Sentry project settings
      authToken: process.env.SENTRY_AUTH_TOKEN,
      telemetry: false, // Optional: disable telemetry
    })
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    sourcemap: true, // Required for Sentry to map minified code to original source
    rollupOptions: {
      output: {
        manualChunks: {
          // Heavy document/PDF libraries
          'vendor-pdf': ['pdfjs-dist', 'jspdf'],
          'vendor-docs': ['mammoth', 'html2canvas'],
          // Charting
          'vendor-charts': ['recharts'],
          // UI primitives (Radix)
          'vendor-radix': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-popover',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-dropdown-menu',
          ],
          // Core infra
          'vendor-core': ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
}));
