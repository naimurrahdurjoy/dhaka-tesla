import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { HttpError } from '../services/pool.service';

export const authRouter = Router();
const authSchema = z.object({ email: z.email(), password: z.string().min(8), name: z.string().min(2).optional(), role: z.enum(['PASSENGER', 'DRIVER']).optional() });
const secret = process.env.JWT_SECRET ?? 'development-only-change-me';

function issueToken(user: { id: string; name: string; role: UserRole; email: string }) {
  const token = jwt.sign({ id: user.id, name: user.name, role: user.role }, secret, { expiresIn: '7d' });
  return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
}

authRouter.post('/login', async (req, res) => {
  const input = authSchema.pick({ email: true, password: true }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  res.json(issueToken(user));
});

authRouter.post('/register', async (req, res) => {
  const input = authSchema.extend({ name: z.string().min(2), role: z.enum(['PASSENGER', 'DRIVER']).default('PASSENGER') }).parse(req.body);
  if (await prisma.user.findUnique({ where: { email: input.email } })) throw new HttpError(409, 'EMAIL_IN_USE', 'An account already exists for this email.');
  const user = await prisma.user.create({
    data: { name: input.name, email: input.email, passwordHash: await bcrypt.hash(input.password, 10), role: input.role, ...(input.role === 'DRIVER' ? { vehicle: { create: { name: 'Bullet', capacity: 3 } } } : {}) }
  });
  res.status(201).json(issueToken(user));
});
