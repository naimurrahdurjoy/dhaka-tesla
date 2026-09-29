import bcrypt from 'bcryptjs';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { app } from '../app';
import { prisma } from '../lib/prisma';

const testPrefix = `signup-${randomUUID()}`;

describe('POST /api/v1/auth/signup', () => {
  test('creates a passenger with a zero-paisa balance and returns a JWT', async () => {
    const email = `${testPrefix}-passenger@example.test`;
    const password = 'secure-passenger-password';
    const response = await request(app).post('/api/v1/auth/signup').send({
      name: 'New Passenger',
      email: email.toUpperCase(),
      password,
      role: 'PASSENGER'
    });

    expect(response.status).toBe(201);
    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body.user).toMatchObject({ name: 'New Passenger', email, role: 'PASSENGER' });

    const user = await prisma.user.findUnique({ where: { email }, include: { vehicle: true } });
    expect(user?.balancePaisa).toBe(0);
    expect(user?.passwordHash).not.toBe(password);
    expect(await bcrypt.compare(password, user!.passwordHash)).toBe(true);
    expect(user?.vehicle).toBeNull();
  });

  test('creates a driver profile and rejects duplicate email addresses', async () => {
    const email = `${testPrefix}-driver@example.test`;
    const response = await request(app).post('/api/v1/auth/signup').send({
      name: 'New Driver',
      email,
      password: 'secure-driver-password',
      role: 'DRIVER'
    });

    expect(response.status).toBe(201);
    expect(response.body.token).toEqual(expect.any(String));

    const user = await prisma.user.findUnique({ where: { email }, include: { vehicle: true } });
    expect(user?.vehicle).toMatchObject({ name: 'Bullet', capacity: 3 });

    const duplicate = await request(app).post('/api/v1/auth/signup').send({
      name: 'Duplicate Driver',
      email: email.toUpperCase(),
      password: 'another-secure-password',
      role: 'DRIVER'
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('EMAIL_IN_USE');
  });
});
