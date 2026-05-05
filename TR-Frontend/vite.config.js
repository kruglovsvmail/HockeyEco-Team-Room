import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Автоматическое обновление Service Worker без участия пользователя
      registerType: 'autoUpdate',
      
      // Настройки стратегии кэширования
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },

      devOptions: {
        enabled: true, // Позволяет тестировать PWA в режиме разработки
        type: 'module',
      },

      manifest: {
        name: 'HockeyEco Team PWA',
        short_name: 'Team PWA',
        description: 'Кабинет хоккейной команды для управления статистикой и составами',
        // Цвет темы изменен на цвет верхней части градиента (#2a2a2a / surface-level2)
        theme_color: '#2a2a2a', 
        background_color: '#0a0a0a',
        // Возвращаем standalone, чтобы значки статус-бара оставались на месте
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
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    host: true // Позволяет открывать сайт по локальному IP с телефона для тестов
  }
});