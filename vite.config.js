import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'Biblioteca Personale',
        short_name: 'Biblioteca',
        description: 'La mia collezione personale di libri, video e giochi',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        // 1. Caching dei file statici (App Shell)
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],

        // 2. Caching dei Dati (API Supabase)
        runtimeCaching: [
          {
            // Caching della tabella 'items' (Lettura dati)
            // Sostituisci 'IL_TUO_PROJECT_ID' qui sotto! 👇
            urlPattern: ({ url }) => {
              return url.hostname.includes('sszleskfdwmfyisshgug.supabase.co') && 
                     url.pathname.includes('/rest/v1/items');
            },
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'supabase-items-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 7 Giorni
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            // Caching delle funzioni RPC (Statistiche e Consigli)
            // Sostituisci 'IL_TUO_PROJECT_ID' qui sotto! 👇
            urlPattern: ({ url }) => {
              return url.hostname.includes('sszleskfdwmfyisshgug.supabase.co') && 
                     url.pathname.includes('/rest/v1/rpc/');
            },
            method: 'POST', // Le RPC usano POST
            handler: 'StaleWhileRevalidate', 
            options: {
              cacheName: 'supabase-rpc-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 2 // 2 Giorni
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ]
})