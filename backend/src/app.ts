import 'dotenv/config';
import express, { ErrorRequestHandler } from 'express';
import cors from 'cors';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { prisma } from './lib/prisma';
import { authRouter } from './routes/auth.routes';
import { apiRouter } from './routes/api.routes';
import { HttpError } from './services/pool.service';

export const app = express();
app.use(cors({ origin: process.env.FRONTEND_ORIGIN?.split(',') ?? true }));
app.use(express.json());
app.get('/health', async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ status: 'ok', service: 'dhaka-tesla-pool-api', database: 'connected' });
});
app.use('/auth', authRouter);
app.use('/', apiRouter);

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.issues.map((issue) => issue.message).join('; ') } });
  if (error instanceof HttpError) return res.status(error.status).json({ error: { code: error.code, message: error.message } });
  if ((error as { code?: string }).code === 'P2002') return res.status(409).json({ error: { code: 'CONFLICT', message: 'This record already exists.' } });
  if (error instanceof Prisma.PrismaClientInitializationError) {
    console.error('Database connection failed:', error.message);
    return res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Cannot connect to PostgreSQL. Start the database and verify DATABASE_URL.' } });
  }
  console.error(error);
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected server error occurred.' } });
};
app.use(errorHandler);
