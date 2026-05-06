/********** ФАЙЛ: TR-Backend\server.js **********/

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import 'dotenv/config';

import pool from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import eventRoutes from './routes/eventRoutes.js';

const app = express();
const PORT = process.env.PORT || 3002;

const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://192.168.1.5:5173'
];

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

// Роуты
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);

const startServer = async () => {
  try {
    await pool.query('SELECT NOW()');
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Сервер HockeyEco-PWA запущен на порту ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Ошибка запуска:', error.message);
    process.exit(1);
  }
};

startServer();