import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
      manifest: {
        name: 'HockeyEco Team Room',
        short_name: 'HockeyEco TR',
        description: 'Кабинет хоккейной команды для управления статистикой и составами',
        // Цвет для статус-бара Android и темы браузера
        theme_color: '#f3f4f6', 
        // Этот цвет заливает фон стартового экрана при загрузке
        background_color: '#f3f4f6',
        // 'standalone' оставляет системные значки (время, батарея) на месте
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            // Обычная иконка 512x512 (например, с прозрачным фоном)
            src: 'regular-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            // Специальная версия для Android (сплошной фон, лого в "безопасной зоне")
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    host: true
  }
});