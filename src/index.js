import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import authRouter from './routes/auth.js';
import profileRouter from './routes/profile.js';
import doctorsRouter from './routes/doctors.js';
import appointmentsRouter from './routes/appointments.js';
import familyRouter from './routes/family.js';
import remindersRouter from './routes/reminders.js';
import reportsRouter from './routes/reports.js';
import prescriptionsRouter from './routes/prescriptions.js';
import articlesRouter from './routes/articles.js';
import communityRouter from './routes/community.js';
import notificationsRouter from './routes/notifications.js';
import reviewsRouter from './routes/reviews.js';
import contactRouter from './routes/contact.js';
import adminRouter from './routes/admin.js';
import telemedicineRouter from './routes/telemedicine.js';
import aiRouter from './routes/ai.js';

const app = express();
const port = Number(process.env.PORT ?? 4000);

// ── Security & logging ───────────────────────────────────────────
app.use(helmet());
app.use(morgan('dev'));

// ── CORS ─────────────────────────────────────────────────────────
app.use(cors({ origin: '*' }));

app.use(express.json({ limit: '2mb' }));

// ── Rate limiting ────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many auth attempts, try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,                   // 30 AI messages per user per hour
  keyGenerator: (req) => req.headers.authorization ?? req.ip,
  message: { error: 'AI rate limit reached, try again in an hour' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth', authLimiter);
app.use('/api', generalLimiter);

// ── Routes ───────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/profile', profileRouter);
app.use('/api/doctors', doctorsRouter);
app.use('/api/appointments', appointmentsRouter);
app.use('/api/family', familyRouter);
app.use('/api/reminders', remindersRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/prescriptions', prescriptionsRouter);
app.use('/api/articles', articlesRouter);
app.use('/api/community', communityRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api/contact', contactRouter);
app.use('/api/admin', adminRouter);
app.use('/api/telemedicine', telemedicineRouter);
app.use('/api/ai', aiLimiter, aiRouter);

// ── Health ───────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'sasthya-sathi-backend', ts: new Date().toISOString() });
});

// ── 404 ──────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ── Global error handler ─────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`Sasthya Sathi backend listening on http://localhost:${port}`);
});
