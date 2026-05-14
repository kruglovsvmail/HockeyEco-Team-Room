import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import 'dotenv/config';
import pool from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import CardGameRoutes from './routes/CardGameRoutes.js';

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

// Роуты
app.use('/api/auth', authRoutes);
app.use('/api/games', CardGameRoutes);

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