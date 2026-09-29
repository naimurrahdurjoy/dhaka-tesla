import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { HttpError } from '../services/pool.service';

export const authRouter = Router();
const credentialsSchema = z.object({ email: z.email().transform((email) => email.trim().toLowerCase()), password: z.string().min(8).max(72) });
const signupSchema = credentialsSchema.extend({ name: z.string().trim().min(2).max(100), role: z.enum(['PASSENGER', 'DRIVER']).default('PASSENGER') });
const secret = process.env.JWT_SECRET ?? 'development-only-change-me';

function issueToken(user: { id: string; name: string; role: UserRole; email: string }) {
  const token = jwt.sign({ id: user.id, name: user.name, role: user.role }, secret, { expiresIn: '7d' });
  return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
}

authRouter.post('/login', async (req, res) => {
  const input = credentialsSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  res.json(issueToken(user));
});

const signup = async (req: import('express').Request, res: import('express').Response) => {
  const input = signupSchema.parse(req.body);
  if (await prisma.user.findUnique({ where: { email: input.email } })) throw new HttpError(409, 'EMAIL_IN_USE', 'An account already exists for this email.');
  const user = await prisma.user.create({
    data: { name: input.name, email: input.email, passwordHash: await bcrypt.hash(input.password, 12), role: input.role, ...(input.role === 'DRIVER' ? { vehicle: { create: { name: 'Bullet', capacity: 3 } } } : {}) }
  });
  res.status(201).json(issueToken(user));
};

authRouter.post('/signup', signup);
authRouter.post('/register', signup);
