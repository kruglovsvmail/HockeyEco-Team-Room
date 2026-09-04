import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
  plugins: [
    react(),
    VitePWA({
      // Переключаем на ручное подтверждение обновлений пользователем
      registerType: 'prompt',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        importScripts: ['/push-sw.js'],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
      manifest: {
        name: 'HockeyEco Team Room',
        short_name: 'Heco',
        description: 'Кабинет хоккейной команды для управления статистикой и составами',
        
        // 🎨 ХАБ УПРАВЛЕНИЯ ЦВЕТОМ СТАРТОВОГО ЭКРАНА
        // Цвет системного статус-бара. Когда Android ставит приложение как WebAPK,
        // это значение запекается в него при установке и живыми правками
        // <meta name="theme-color"> уже не меняется — поэтому панель одна на обе
        // темы. Менять только вместе с theme-color в index.html и заливкой верхней
        // safe-area зоны в App.jsx. Новый цвет доедет до установленных приложений
        // не сразу: Chrome сверяет манифест примерно раз в сутки и пересобирает WebAPK.
        theme_color: '#242424',
        background_color: '#e2e4e7', // Физический фон системного Splash Screen при клике на иконку
        
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