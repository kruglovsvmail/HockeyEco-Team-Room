process.env.TZ = 'UTC';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import 'dotenv/config';

import pool from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import calendarRoutes from './routes/calendarRoutes.js';
import matchRoutes from './routes/matchRoutes.js';
import trainingRoutes from './routes/trainingRoutes.js';
import meetingRoutes from './routes/meetingRoutes.js';
import teamRoutes from './routes/teamRoutes.js';
import clubRoutes from './routes/clubRoutes.js';
import profileRouter from './routes/profileRouter.js';
import registrationRoutes from './routes/registrationRoutes.js';
import tournamentRoutes from './routes/tournamentRoutes.js';
import playerRoutes from './routes/playerRoutes.js';
import pushRoutes from './routes/pushRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import subscriptionRoutes from './routes/subscriptionRoutes.js';
import policyRoutes from './routes/policyRoutes.js';
import drillRoutes from './routes/drillRoutes.js';
import { processScheduledNotifications, processBirthdays, pollLmsGames } from './services/pushService.js';
import { lockPastEventFees } from './utils/eventFees.js';

// Импорт новых роутов управления командой
import mgrEventRoutes from './routes/manager/mgrEventRoutes.js';
import mgrSeasonRoutes from './routes/manager/mgrSeasonRoutes.js';
import mgrFinanceRoutes from './routes/manager/mgrFinanceRoutes.js';
import mgrHandbookRoutes from './routes/manager/mgrHandbookRoutes.js';

const app = express();
const PORT = process.env.PORT || 3002;

// Приложение живёт за прокси Timeweb Cloud: HTTPS терминируется там, а в контейнер
// приходит обычный HTTP, поэтому без этой строки req.ip отдавал бы адрес прокси —
// один и тот же для всех пользователей. Значение 1 — доверяем ровно одному узлу
// перед нами, то есть берём адрес, который проставил сам прокси, а не тот, что мог
// подделать клиент в заголовке X-Forwarded-For.
app.set('trust proxy', 1);

// --- Настройка CORS ---
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
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

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Базовые системные роуты
app.use('/api/auth', authRoutes);

// Роуты самостоятельной регистрации объявляют полные пути внутри себя, поэтому
// монтируются в корень — как profileRouter
app.use(registrationRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/trainings', trainingRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/clubs', clubRoutes);
app.use('/api/tournaments', tournamentRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/policy', policyRoutes);
// Тренерская — личная библиотека упражнений
app.use('/api/drills', drillRoutes);
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

// Порт открываем сразу, не дожидаясь БД — /api/health в неё не ходит, и проверка связи с
// фронтенда (как и healthcheck платформы) не должна зависеть от того, насколько быстро
// отвечает Postgres. Раньше сбой на этом шаге ронял процесс через process.exit(1), и любая
// сетевая заминка до БД оставляла сайт без бэкенда — фронтенд уходил в офлайн целиком.
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);

  // Крон: обработка очереди отложенных push-уведомлений каждые 60 секунд
  setInterval(() => {
    processScheduledNotifications().catch(err =>
      console.error('Ошибка обработки отложенных уведомлений:', err.message)
    );
  }, 60_000);

  // Крон: дни рождения — планируем в 05:00 UTC (достаточно рано для всех RU-таймзон),
  // а каждое уведомление уже запланировано на 08:00 по локальному времени получателя.
  const scheduleBirthdayCron = () => {
    const now = new Date();
    const next5am = new Date(now);
    next5am.setUTCHours(5, 0, 0, 0);
    if (next5am <= now) next5am.setUTCDate(next5am.getUTCDate() + 1);
    const delay = next5am.getTime() - now.getTime();
    setTimeout(() => {
      processBirthdays().catch(err => console.error('Ошибка обработки дней рождения:', err.message));
      setInterval(() => {
        processBirthdays().catch(err => console.error('Ошибка обработки дней рождения:', err.message));
      }, 24 * 60 * 60_000);
    }, delay);
  };
  scheduleBirthdayCron();

  // Крон: поллинг LMS-матчей (official) каждые 5 минут
  setInterval(() => {
    pollLmsGames().catch(err =>
      console.error('Ошибка поллинга LMS-матчей:', err.message)
    );
  }, 5 * 60_000);

  // Крон: фиксация долевой стоимости прошедших событий каждые 5 минут.
  // После начала события цена перестаёт зависеть от состава отметок —
  // доли раскладываются по отметкам в final_fee и больше не пересчитываются.
  setInterval(() => {
    lockPastEventFees().catch(err =>
      console.error('Ошибка фиксации стоимости прошедших событий:', err.message)
    );
  }, 5 * 60_000);
});

// Проверка соединения с БД — фоновая, только для лога.
pool.query('SELECT NOW()')
  .then((res) => console.log('PostgreSQL connected:', res.rows[0].now))
  .catch((err) => console.error('PostgreSQL connection check failed:', err.message));