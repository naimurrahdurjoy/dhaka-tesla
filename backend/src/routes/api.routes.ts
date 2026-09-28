import { Router } from 'express';
import { RideStatus, UserRole } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { calculateFarePaisa, HttpError, joinPool, transitionRide } from '../services/pool.service';

export const apiRouter = Router();
apiRouter.use(requireAuth);
const passengerOnly = requireRole(UserRole.PASSENGER);
const driverOnly = requireRole(UserRole.DRIVER);

apiRouter.get('/areas', async (_req, res) => res.json(await prisma.area.findMany({ orderBy: { name: 'asc' } })));

apiRouter.get('/passenger/dashboard', passengerOnly, async (req, res) => {
  const rides = await prisma.rideRequest.findMany({
    where: { passengerId: req.user!.id },
    include: {
      pickupArea: true,
      dropoffArea: true,
      membership: { include: { pool: { include: { vehicle: { include: { driver: { select: { name: true } } } } } } } },
      history: { orderBy: { changedAt: 'asc' } }
    },
    orderBy: { createdAt: 'desc' }
  });
  res.json({ rides });
});

apiRouter.post('/rides', passengerOnly, async (req, res) => {
  const input = z.object({ pickupAreaId: z.string(), dropoffAreaId: z.string(), requestedSeats: z.number().int().min(1).max(3).default(1) }).parse(req.body);
  const [pickup, dropoff] = await Promise.all([
    prisma.area.findUnique({ where: { id: input.pickupAreaId } }),
    prisma.area.findUnique({ where: { id: input.dropoffAreaId } })
  ]);
  if (!pickup || !dropoff) throw new HttpError(400, 'AREA_NOT_FOUND', 'Select a valid pickup and dropoff area.');
  const estimatedFare = calculateFarePaisa(pickup.name, dropoff.name);
  const ride = await prisma.rideRequest.create({ data: { ...input, passengerId: req.user!.id, estimatedFare }, include: { pickupArea: true, dropoffArea: true } });
  res.status(201).json({ ...ride, fareBdt: ride.estimatedFare / 100 });
});

apiRouter.get('/rides/:id', async (req, res) => {
  const ride = await prisma.rideRequest.findUnique({
      where: { id: String(req.params.id) },
    include: {
      pickupArea: true,
      dropoffArea: true,
      membership: { include: { pool: { include: { vehicle: { include: { driver: { select: { name: true } } } } } } } },
      history: { orderBy: { changedAt: 'asc' } },
      payments: true
    }
  });
  if (!ride) throw new HttpError(404, 'RIDE_NOT_FOUND', 'Ride request was not found.');
  const isDriverOwner = req.user!.role === UserRole.DRIVER && ride.membership && (await prisma.vehicle.findFirst({ where: { driverId: req.user!.id, pools: { some: { id: ride.membership.poolId } } } }));
  if (ride.passengerId !== req.user!.id && !isDriverOwner) throw new HttpError(403, 'RIDE_NOT_OWNED', 'You cannot view this ride.');
  res.json(ride);
});

apiRouter.post('/rides/:id/cancel', passengerOnly, async (req, res) => {
  const ride = await prisma.rideRequest.findUnique({ where: { id: String(req.params.id) } });
  if (!ride || ride.passengerId !== req.user!.id) throw new HttpError(404, 'RIDE_NOT_FOUND', 'Ride request was not found.');
  res.json(await transitionRide(ride.id, RideStatus.CANCELLED, req.user!.id));
});

apiRouter.get('/pools', async (_req, res) => {
  const pools = await prisma.pool.findMany({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } }, include: { vehicle: { include: { driver: { select: { name: true } } } }, members: { include: { ride: { include: { passenger: { select: { name: true } }, pickupArea: true, dropoffArea: true } } } } }, orderBy: { createdAt: 'desc' } });
  res.json(pools.map((pool) => ({ ...pool, occupiedSeats: pool.members.reduce((total, item) => total + item.seats, 0) })));
});

apiRouter.post('/pools/:id/join', passengerOnly, async (req, res) => {
  const body = z.object({ rideId: z.string() }).parse(req.body);
  res.json(await joinPool(String(req.params.id), body.rideId, req.user!.id));
});

apiRouter.post('/driver/online', driverOnly, async (req, res) => {
  const input = z.object({ isOnline: z.boolean() }).parse(req.body);
  const vehicle = await prisma.vehicle.update({ where: { driverId: req.user!.id }, data: { isOnline: input.isOnline } });
  if (input.isOnline) {
    const openPool = await prisma.pool.findFirst({ where: { vehicleId: vehicle.id, status: 'OPEN' } });
    if (!openPool) await prisma.pool.create({ data: { vehicleId: vehicle.id, status: 'OPEN' } });
  }
  res.json(vehicle);
});

async function getDriverPool(driverId: string) {
  const vehicle = await prisma.vehicle.findUnique({ where: { driverId } });
  if (!vehicle) throw new HttpError(404, 'VEHICLE_NOT_FOUND', 'No vehicle is assigned to this driver.');
  let pool = await prisma.pool.findFirst({ where: { vehicleId: vehicle.id, status: 'OPEN' } });
  if (!pool) pool = await prisma.pool.create({ data: { vehicleId: vehicle.id, status: 'OPEN' } });
  return pool;
}

apiRouter.post('/rides/:id/accept', driverOnly, async (req, res) => {
  const ride = await prisma.rideRequest.findUnique({ where: { id: String(req.params.id) } });
  if (!ride || ride.status !== RideStatus.REQUESTED) throw new HttpError(409, 'RIDE_NOT_REQUESTED', 'This ride is no longer available.');
  const pool = await getDriverPool(req.user!.id);
  const joined = await joinPool(pool.id, ride.id, ride.passengerId, req.user!.id);
  res.json(joined);
});

const lifecycleEndpoints: Array<[string, RideStatus]> = [
  ['arrive', RideStatus.DRIVER_ARRIVED],
  ['start', RideStatus.STARTED],
  ['complete', RideStatus.COMPLETED]
];
for (const [action, state] of lifecycleEndpoints) {
  apiRouter.post(`/rides/:id/${action}`, driverOnly, async (req, res) => {
    const ride = await prisma.rideRequest.findUnique({ where: { id: String(req.params.id) }, include: { membership: true } });
    if (!ride?.membership) throw new HttpError(404, 'RIDE_NOT_FOUND', 'Ride is not assigned to a pool.');
    const ownsVehicle = await prisma.vehicle.findFirst({ where: { driverId: req.user!.id, pools: { some: { id: ride.membership.poolId } } } });
    if (!ownsVehicle) throw new HttpError(403, 'RIDE_NOT_OWNED', 'This ride is assigned to another driver.');
    const updated = await transitionRide(ride.id, state, req.user!.id);
    if (state === RideStatus.COMPLETED) {
      const remaining = await prisma.poolMembership.count({ where: { poolId: ride.membership.poolId, ride: { status: { not: RideStatus.COMPLETED } } } });
      if (remaining === 0) await prisma.pool.update({ where: { id: ride.membership.poolId }, data: { status: 'COMPLETED' } });
    } else if (state === RideStatus.STARTED) {
      await prisma.pool.update({ where: { id: ride.membership.poolId }, data: { status: 'IN_PROGRESS' } });
    }
    res.json(updated);
  });
}

apiRouter.get('/driver/dashboard', driverOnly, async (req, res) => {
  const vehicle = await prisma.vehicle.findUnique({ where: { driverId: req.user!.id } });
  if (!vehicle) throw new HttpError(404, 'VEHICLE_NOT_FOUND', 'No vehicle is assigned to this driver.');
  const pools = await prisma.pool.findMany({ where: { vehicleId: vehicle.id, status: { in: ['OPEN', 'IN_PROGRESS'] } }, include: { members: { include: { ride: { include: { passenger: { select: { name: true } }, pickupArea: true, dropoffArea: true } } } } } });
  const requests = await prisma.rideRequest.findMany({ where: { status: RideStatus.REQUESTED }, include: { passenger: { select: { name: true } }, pickupArea: true, dropoffArea: true }, orderBy: { createdAt: 'asc' } });
  res.json({ vehicle, pools: pools.map((pool) => ({ ...pool, occupiedSeats: pool.members.reduce((total, item) => total + item.seats, 0) })), requests });
});
