process.env.TZ = 'UTC';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import 'dotenv/config';

import pool from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import EventRoutes from './routes/EventRoutes.js'; 
import teamRoutes from './routes/teamRoutes.js';
import profileRouter from './routes/profileRouter.js';
import tournamentRoutes from './routes/tournamentRoutes.js'; // Импорт роутера турниров

// Импорт новых роутов управления командой
import mgrEventRoutes from './routes/manager/mgrEventRoutes.js';
import mgrSeasonRoutes from './routes/manager/mgrSeasonRoutes.js';
import mgrFinanceRoutes from './routes/manager/mgrFinanceRoutes.js';
import mgrHandbookRoutes from './routes/manager/mgrHandbookRoutes.js';

const app = express();
const PORT = process.env.PORT || 3002;

// --- Настройка CORS ---
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://192.168.1.5:5173',
].filter(Boolean);

app.use(morgan('dev'));
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS policy violation: ${origin} is not allowed`));
    }
  },
  credentials: true
}));

app.use(express.json());

// Базовые системные роуты
app.use('/api/auth', authRoutes);
app.use('/api/events', EventRoutes); 
app.use('/api/teams', teamRoutes);
app.use('/api/tournaments', tournamentRoutes); // Регистрация эндпоинта турниров
app.use(profileRouter);

// Новые эндпоинты раздела Руководства
app.use('/api/manager/events', mgrEventRoutes);
app.use('/api/manager/seasons', mgrSeasonRoutes);
app.use('/api/manager/finances', mgrFinanceRoutes);
app.use('/api/manager/handbooks', mgrHandbookRoutes);

// --- ГЛОБАЛЬНЫЙ ОБРАБОТЧИК ОШИБОК ---
// Гарантирует, что при любом непредвиденном сбое бэкенд вернет JSON, а не HTML-страницу
app.use((err, req, res, next) => {
  console.error('🚨 Критическая системная ошибка:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Внутренняя ошибка сервера'
  });
});

const startServer = async () => {
  try {
    const res = pool.query('SELECT NOW()');
    console.log('PostgreSQL connected:', (await res).rows[0].now);
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

startServer();