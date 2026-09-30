import request from 'supertest';
import jwt from 'jsonwebtoken';
import { RideStatus } from '@prisma/client';
import { app } from '../app';
import { prisma } from '../lib/prisma';
import { calculateFarePaisa } from '../services/pool.service';

const secret = process.env.JWT_SECRET ?? 'development-only-change-me';
const suffix = 'pool-integration-test';
let driver: { id: string; name: string };
let passengers: Array<{ id: string; name: string }>;
let vehicleId: string;
let areaIds: Record<string, string>;
let driverToken: string;
let passengerTokens: string[];

function token(user: { id: string; name: string }, role: 'DRIVER' | 'PASSENGER') {
  return jwt.sign({ id: user.id, name: user.name, role }, secret);
}

async function fixturePool() {
  const pool = await prisma.pool.create({ data: { vehicleId, status: 'OPEN' } });
  return pool.id;
}

async function fixtureRide(passengerIndex: number, seats = 1, status: RideStatus = RideStatus.REQUESTED) {
  return prisma.rideRequest.create({
    data: {
      passengerId: passengers[passengerIndex].id,
      pickupAreaId: areaIds.Banani,
      dropoffAreaId: areaIds[passengerIndex % 2 === 0 ? 'Mohakhali' : 'Gulshan 1'],
      requestedSeats: seats,
      status,
      estimatedFare: passengerIndex % 2 === 0 ? 9600 : 7520
    }
  });
}

beforeAll(async () => {
  const areas = await Promise.all([
    prisma.area.upsert({ where: { name: 'Banani' }, update: {}, create: { name: 'Banani', latitude: 23.7937, longitude: 90.4066 } }),
    prisma.area.upsert({ where: { name: 'Mohakhali' }, update: {}, create: { name: 'Mohakhali', latitude: 23.7798, longitude: 90.4007 } }),
    prisma.area.upsert({ where: { name: 'Gulshan 1' }, update: {}, create: { name: 'Gulshan 1', latitude: 23.7808, longitude: 90.4167 } })
  ]);
  areaIds = Object.fromEntries(areas.map((area) => [area.name, area.id]));
  driver = await prisma.user.upsert({
    where: { email: `driver-${suffix}@example.test` }, update: {},
    create: { name: 'Jashim', email: `driver-${suffix}@example.test`, passwordHash: 'test-hash', role: 'DRIVER' }
  });
  passengers = await Promise.all([0, 1, 2, 3].map((index) => prisma.user.upsert({
    where: { email: `passenger-${index}-${suffix}@example.test` }, update: {},
    create: { name: ['Nusrat', 'Rafiq', 'Shirin', 'Test Passenger'][index], email: `passenger-${index}-${suffix}@example.test`, passwordHash: 'test-hash', role: 'PASSENGER' }
  })));
  const vehicle = await prisma.vehicle.upsert({ where: { driverId: driver.id }, update: { capacity: 3, isOnline: true }, create: { driverId: driver.id, name: 'Bullet', capacity: 3, isOnline: true } });
  vehicleId = vehicle.id;
  driverToken = token(driver, 'DRIVER');
  passengerTokens = passengers.map((passenger) => token(passenger, 'PASSENGER'));
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Dhaka Tesla integration', () => {
  test('calculates deterministic pooled fares for Nusrat and Rafiq', async () => {
    expect(calculateFarePaisa('Banani', 'Mohakhali')).toBe(9600);
    expect(calculateFarePaisa('Banani', 'Gulshan 1')).toBe(7520);
    const response = await request(app).post('/rides').set('Authorization', `Bearer ${passengerTokens[0]}`).send({ pickupAreaId: areaIds.Banani, dropoffAreaId: areaIds.Mohakhali, requestedSeats: 1 });
    expect(response.status).toBe(201);
    expect(response.body.estimatedFare).toBe(9600);
  });

  test('enforces Bullet capacity of exactly three seats', async () => {
    const poolId = await fixturePool();
    const fullRide = await fixtureRide(0, 3, RideStatus.MATCHED);
    await prisma.poolMembership.create({ data: { poolId, rideId: fullRide.id, seats: 3, farePaisa: 9600 } });
    const requestRide = await fixtureRide(1);
    const response = await request(app).post(`/pools/${poolId}/join`).set('Authorization', `Bearer ${passengerTokens[1]}`).send({ rideId: requestRide.id });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('POOL_CAPACITY_EXCEEDED');
  });

  test('rejects invalid lifecycle transitions', async () => {
    const poolId = await fixturePool();
    const completedRide = await fixtureRide(0, 1, RideStatus.COMPLETED);
    await prisma.poolMembership.create({ data: { poolId, rideId: completedRide.id, seats: 1, farePaisa: 9600 } });
    const response = await request(app).post(`/rides/${completedRide.id}/start`).set('Authorization', `Bearer ${driverToken}`);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INVALID_STATE_TRANSITION');
  });

  test('reports completed ride earnings for the driver vehicle only', async () => {
    const before = await request(app).get('/driver/dashboard').set('Authorization', `Bearer ${driverToken}`);
    expect(before.status).toBe(200);
    const poolId = await fixturePool();
    const completedRide = await fixtureRide(0, 1, RideStatus.COMPLETED);
    const activeRide = await fixtureRide(1, 1, RideStatus.MATCHED);
    await prisma.poolMembership.createMany({ data: [
      { poolId, rideId: completedRide.id, seats: 1, farePaisa: 9600 },
      { poolId, rideId: activeRide.id, seats: 1, farePaisa: 7520 }
    ] });
    const otherDriver = await prisma.user.create({ data: { name: 'Other Driver', email: `other-driver-${suffix}@example.test`, passwordHash: 'test-hash', role: 'DRIVER' } });
    const otherVehicle = await prisma.vehicle.create({ data: { driverId: otherDriver.id, name: 'Other vehicle', capacity: 3 } });
    const otherPool = await prisma.pool.create({ data: { vehicleId: otherVehicle.id } });
    const otherCompletedRide = await fixtureRide(2, 1, RideStatus.COMPLETED);
    await prisma.poolMembership.create({ data: { poolId: otherPool.id, rideId: otherCompletedRide.id, seats: 1, farePaisa: 12000 } });
    const after = await request(app).get('/driver/dashboard').set('Authorization', `Bearer ${driverToken}`);
    expect(after.body.totalEarningsPaisa).toBe(before.body.totalEarningsPaisa + 9600);
  });

  test('serializes concurrent attempts for the final Bullet seat', async () => {
    const poolId = await fixturePool();
    const twoSeatRide = await fixtureRide(0, 2, RideStatus.MATCHED);
    await prisma.poolMembership.create({ data: { poolId, rideId: twoSeatRide.id, seats: 2, farePaisa: 9600 } });
    const firstRide = await fixtureRide(1);
    const secondRide = await fixtureRide(2);
    const results = await Promise.all([
      request(app).post(`/pools/${poolId}/join`).set('Authorization', `Bearer ${passengerTokens[1]}`).send({ rideId: firstRide.id }),
      request(app).post(`/pools/${poolId}/join`).set('Authorization', `Bearer ${passengerTokens[2]}`).send({ rideId: secondRide.id })
    ]);
    expect(results.map((response) => response.status).sort()).toEqual([200, 409]);
    const failed = results.find((response) => response.status === 409);
    expect(failed?.body.error.code).toBe('POOL_CAPACITY_EXCEEDED');
    const memberships = await prisma.poolMembership.aggregate({ where: { poolId }, _sum: { seats: true } });
    expect(memberships._sum.seats).toBe(3);
  });
});
