import { PaymentStatus, Prisma, RideStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';

export class HttpError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

const routeDistanceKm: Record<string, number> = {
  'Banani|Mohakhali': 3.5,
  'Banani|Gulshan 1': 2.2,
  'Banani|Dhanmondi': 9.8,
  'Banani|Mirpur': 10.4,
  'Banani|Uttara': 17.2
};

export function calculateFarePaisa(pickup: string, dropoff: string, pooled = true): number {
  if (pickup === dropoff) throw new HttpError(400, 'INVALID_ROUTE', 'Pickup and dropoff must be different.');
  const direct = routeDistanceKm[`${pickup}|${dropoff}`];
  const reverse = routeDistanceKm[`${dropoff}|${pickup}`];
  const distanceKm = direct ?? reverse;
  if (distanceKm === undefined) throw new HttpError(400, 'UNSUPPORTED_ROUTE', 'Fare is not available for this route yet.');
  const baseFare = 5000;
  const distanceCharge = Math.round(distanceKm * 2000);
  const poolDiscount = pooled ? Math.round((baseFare + distanceCharge) * 0.2) : 0;
  return baseFare + distanceCharge - poolDiscount;
}

const nextState: Partial<Record<RideStatus, RideStatus[]>> = {
  REQUESTED: [RideStatus.MATCHED, RideStatus.CANCELLED],
  MATCHED: [RideStatus.DRIVER_ARRIVED, RideStatus.CANCELLED],
  DRIVER_ARRIVED: [RideStatus.STARTED, RideStatus.CANCELLED],
  STARTED: [RideStatus.COMPLETED],
  COMPLETED: [],
  CANCELLED: []
};

export async function joinPool(poolId: string, rideId: string, passengerId: string, changedBy = passengerId) {
  return prisma.$transaction(async (tx) => {
    const lockedPools = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Pool" WHERE id = ${poolId} FOR UPDATE`;
    if (!lockedPools.length) throw new HttpError(404, 'POOL_NOT_FOUND', 'Pool was not found.');

    const [pool, ride] = await Promise.all([
      tx.pool.findUnique({ where: { id: poolId }, include: { vehicle: true } }),
      tx.rideRequest.findUnique({ where: { id: rideId } })
    ]);
    if (!pool || pool.status !== 'OPEN' || !pool.vehicle.isOnline) throw new HttpError(409, 'POOL_UNAVAILABLE', 'This pool is not accepting riders.');
    if (!ride) throw new HttpError(404, 'RIDE_NOT_FOUND', 'Ride request was not found.');
    if (ride.passengerId !== passengerId) throw new HttpError(403, 'RIDE_NOT_OWNED', 'You can only join a pool with your own ride request.');
    if (ride.status !== RideStatus.REQUESTED) throw new HttpError(409, 'RIDE_NOT_REQUESTED', 'Only requested rides can join a pool.');

    const seats = await tx.poolMembership.aggregate({ where: { poolId }, _sum: { seats: true } });
    const occupiedSeats = seats._sum.seats ?? 0;
    if (occupiedSeats + ride.requestedSeats > pool.vehicle.capacity) {
      throw new HttpError(409, 'POOL_CAPACITY_EXCEEDED', 'The Bullet has no seats available for this request.');
    }

    const [pickup, dropoff] = await Promise.all([
      tx.area.findUniqueOrThrow({ where: { id: ride.pickupAreaId } }),
      tx.area.findUniqueOrThrow({ where: { id: ride.dropoffAreaId } })
    ]);
    const farePaisa = calculateFarePaisa(pickup.name, dropoff.name, true);
    await tx.poolMembership.create({ data: { poolId, rideId, seats: ride.requestedSeats, farePaisa } });
    const updatedRide = await tx.rideRequest.update({ where: { id: rideId }, data: { status: RideStatus.MATCHED, estimatedFare: farePaisa } });
    await tx.rideStatusHistory.create({ data: { rideId, fromStatus: RideStatus.REQUESTED, toStatus: RideStatus.MATCHED, changedBy } });
    return { ride: updatedRide, farePaisa, occupiedSeats: occupiedSeats + ride.requestedSeats, capacity: pool.vehicle.capacity };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

export async function transitionRide(rideId: string, toStatus: RideStatus, changedBy: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "RideRequest" WHERE id = ${rideId} FOR UPDATE`;
    const ride = await tx.rideRequest.findUnique({ where: { id: rideId }, include: { membership: true } });
    if (!ride) throw new HttpError(404, 'RIDE_NOT_FOUND', 'Ride request was not found.');
    if (!nextState[ride.status]?.includes(toStatus)) {
      throw new HttpError(409, 'INVALID_STATE_TRANSITION', `Cannot change a ride from ${ride.status} to ${toStatus}.`);
    }
    const updated = await tx.rideRequest.update({
      where: { id: rideId },
      data: { status: toStatus, ...(toStatus === RideStatus.COMPLETED ? { finalFare: ride.membership?.farePaisa ?? ride.estimatedFare } : {}) }
    });
    await tx.rideStatusHistory.create({ data: { rideId, fromStatus: ride.status, toStatus, changedBy } });
    if (toStatus === RideStatus.CANCELLED && ride.membership) {
      await tx.poolMembership.delete({ where: { rideId } });
    }
    if (toStatus === RideStatus.COMPLETED) {
      const amountPaisa = ride.membership?.farePaisa ?? ride.estimatedFare;
      await tx.payment.create({ data: { rideId, passengerId: ride.passengerId, amountPaisa, status: PaymentStatus.PENDING } });
    }
    return updated;
  });
}
