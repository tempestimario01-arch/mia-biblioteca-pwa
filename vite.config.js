import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa' // <-- 1. Importa il plugin

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    
    // --- 2. Aggiungi il plugin PWA ---
    VitePWA({
      registerType: 'autoUpdate', // Aggiorna l'app automaticamente
      injectRegister: 'auto',
      
      // workbox è il motore che crea il service worker
      workbox: {
        // Mette in cache tutti i file principali dell'app
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      },

      // Questo crea il file 'manifest.json' per noi
      manifest: {
        name: 'mia-Biblioteca',
        short_name: 'Biblioteca',
        description: 'La tua libreria PWA personale',
        theme_color: '#F4F1E9', // Un colore seppia per la barra del browser
        background_color: '#F4F1E9',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'vite.svg', // Usa l'icona vite.svg che hai già
            sizes: 'any',
            type: 'image/svg+xml'
          },
          {
            src: 'vite_192.png', // Dovremo creare questa icona
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'vite_512.png', // Dovremo creare questa icona
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
    // --- Fine plugin PWA ---
  ],
})