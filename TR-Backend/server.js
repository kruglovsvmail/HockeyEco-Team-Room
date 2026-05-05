/********** ФАЙЛ: TR-Backend\server.js **********/

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import 'dotenv/config';

// Импорт конфигураций
import pool from './config/db.js';
// Импорт роутов
import authRoutes from './routes/authRoutes.js';

const app = express();
const PORT = process.env.PORT || 3002;

// --- Настройка CORS ---
// Формируем список разрешенных доменов в зависимости от окружения
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? [process.env.FRONTEND_URL] // В проде строго только один URL из .env
  : [
      process.env.FRONTEND_URL, // Твой IP для телефона (192.168.1.2)
      'http://localhost:5173',  // Для локальной разработки на ПК
      'http://127.0.0.1:5173'   // Альтернативный локальный адрес
    ].filter(Boolean); // Фильтруем пустые значения на случай отсутствия переменной

// --- Middlewares ---

// Логирование запросов в консоль (удобно для разработки)
app.use(morgan('dev'));

// Настройка CORS с динамической проверкой
app.use(cors({
  origin: function (origin, callback) {
    // Разрешаем запросы без origin (например, Postman) или если origin есть в списке
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS policy violation: ${origin} is not allowed`));
    }
  },
  credentials: true
}));

// Парсинг JSON
app.use(express.json());

// --- Роуты ---

// Приветственный роут для проверки работоспособности
app.get('/', (req, res) => {
  res.json({ 
    message: 'HockeyEco Team PWA API is running',
    version: '1.0.0'
  });
});

// Подключаем авторизацию (логин по телефону и паролю)
app.use('/api/auth', authRoutes);

// --- Обработка ошибок ---

// Обработка 404
app.use((req, res) => {
  res.status(404).json({ message: 'Эндпоинт не найден' });
});

// Глобальный обработчик ошибок
app.use((err, req, res, next) => {
  // Перехватываем ошибки CORS и отдаем аккуратный 403 статус
  if (err.message.startsWith('CORS')) {
    return res.status(403).json({ success: false, message: 'Доступ запрещен настройками CORS' });
  }

  console.error('⚠️ Server Error:', err.stack);
  res.status(500).json({ 
    message: 'Внутренняя ошибка сервера',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// --- Запуск сервера ---

const startServer = async () => {
  try {
    // Проверяем соединение с БД перед запуском
    await pool.query('SELECT NOW()');

    app.listen(PORT, () => {
      console.log(`
🚀 Сервер HockeyEco-PWA запущен!
📡 Порт: ${PORT}
🔗 URL: http://localhost:${PORT}
🛡️ Окружение: ${process.env.NODE_ENV}
🌍 CORS разрешен для: ${allowedOrigins.join(', ')}
      `);
    });

  } catch (error) {
    console.error('❌ Не удалось запустить сервер из-за ошибки БД:', error.message);
    process.exit(1);
  }
};

startServer();