import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from './config/env';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { authRouter } from './routes/auth';
import { workerRouter } from './routes/workers';
import { complaintRouter } from './routes/complaints';
import { assetRouter } from './routes/assets';
import { inspectionRouter } from './routes/inspections';
import { riskRouter } from './routes/risk';
import { maintenanceRouter } from './routes/maintenance';
import { dashboardRouter } from './routes/dashboard';
import { gisRouter } from './routes/gis';
import { notificationRouter } from './routes/notifications';
import { auditRouter } from './routes/audit';
import { settingsRouter } from './routes/settings';
import { sensorRouter, weatherRouter } from './routes/sensors';
import { reportRouter } from './routes/reports';
import { citizenRouter } from './routes/citizens';
import { alertRouter } from './routes/alerts';
import { imageRouter } from './routes/images';
import { measurementRouter } from './routes/measurements';

const app = express();

// ── Security middleware ───────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin: config.FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
}));

// ── Rate limiting ─────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX,
  message: { success: false, message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Stricter limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many authentication attempts.' },
});
app.use('/api/auth/', authLimiter);

// ── General middleware ────────────────────────────────────────
app.use(compression());
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Health check ──────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'NEXORA AI Backend', version: '1.0.0' });
});

// ── API Routes ────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/workers', workerRouter);
app.use('/api/citizens', citizenRouter);
app.use('/api/complaints', complaintRouter);
app.use('/api/assets', assetRouter);
app.use('/api/inspections', inspectionRouter);
app.use('/api/risk', riskRouter);
app.use('/api/maintenance', maintenanceRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/gis', gisRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/audit', auditRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/sensors', sensorRouter);
app.use('/api/weather', weatherRouter);
app.use('/api/reports', reportRouter);
app.use('/api/alerts', alertRouter);
app.use('/api/images', imageRouter);
app.use('/api/measurements', measurementRouter);
// Note: weatherRouter and sensorRouter are both exported from routes/sensors.ts

// ── Error handler ─────────────────────────────────────────────
app.use(errorHandler);

// ── Start server ──────────────────────────────────────────────
app.listen(config.PORT, () => {
  logger.info(`🚀 NEXORA AI Backend running on port ${config.PORT} [${config.NODE_ENV}]`);
});

export default app;
