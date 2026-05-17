process.env.TZ = 'UTC';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import 'dotenv/config';

import pool from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import EventRoutes from './routes/EventRoutes.js'; 
import teamRoutes from './routes/teamRoutes.js'; // НОВЫЙ ИМПОРТ

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
app.use('/api/events', EventRoutes); 
app.use('/api/teams', teamRoutes); // НОВЫЙ РОУТ

const startServer = async () => {
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('PostgreSQL connected:', res.rows[0].now);
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

startServer();