import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Переключаем на ручное подтверждение обновлений пользователем
      registerType: 'prompt',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
      manifest: {
        name: 'HockeyEco Team Room',
        short_name: 'HockeyEco TR',
        description: 'Кабинет хоккейной команды для управления статистикой и составами',
        
        // 🎨 ХАБ УПРАВЛЕНИЯ ЦВЕТОМ СТАРТОВОГО ЭКРАНА (Замените #0f172a на ваш hex-код)
        theme_color: '#d1d5db',      // Цвет сервисной строки браузера и шапки PWA
        background_color: '#d1d5db', // Физический фон системного Splash Screen при клике на иконку
        
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
            src: 'regular-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      }
    })
  ]
});