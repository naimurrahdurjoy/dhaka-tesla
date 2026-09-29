import { PrismaClient, RideStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const areas = [
  { name: 'Banani', latitude: 23.7937, longitude: 90.4066 },
  { name: 'Mohakhali', latitude: 23.7798, longitude: 90.4007 },
  { name: 'Gulshan 1', latitude: 23.7808, longitude: 90.4167 },
  { name: 'Dhanmondi', latitude: 23.7461, longitude: 90.3742 },
  { name: 'Mirpur', latitude: 23.8223, longitude: 90.3654 },
  { name: 'Uttara', latitude: 23.8759, longitude: 90.3795 }
];

async function main() {
  const seedPassword = process.env.SEED_PASSWORD ?? (process.env.NODE_ENV === 'production' ? '' : 'tesla2026');
  if (!seedPassword) throw new Error('Set SEED_PASSWORD before seeding production accounts.');

  const seededAreas = new Map<string, string>();
  for (const area of areas) {
    const saved = await prisma.area.upsert({ where: { name: area.name }, update: area, create: area });
    seededAreas.set(area.name, saved.id);
  }

  const passwordHash = await bcrypt.hash(seedPassword, 10);
  const actors = [
    { name: 'Jashim', email: 'driver@teslapool.demo', role: 'DRIVER' as const },
    { name: 'Nusrat', email: 'passenger1@teslapool.demo', role: 'PASSENGER' as const },
    { name: 'Rafiq', email: 'passenger2@teslapool.demo', role: 'PASSENGER' as const },
    { name: 'Shirin', email: 'passenger3@teslapool.demo', role: 'PASSENGER' as const }
  ];
  const users = new Map<string, { id: string; name: string }>();
  for (const actor of actors) {
    const user = await prisma.user.upsert({
      where: { email: actor.email },
      update: { name: actor.name, role: actor.role, passwordHash },
      create: { ...actor, passwordHash }
    });
    users.set(actor.name, user);
  }

  const driver = users.get('Jashim')!;
  const vehicle = await prisma.vehicle.upsert({
    where: { driverId: driver.id },
    update: { name: 'Bullet', capacity: 3, isOnline: true },
    create: { driverId: driver.id, name: 'Bullet', capacity: 3, isOnline: true }
  });
  let pool = await prisma.pool.findFirst({ where: { vehicleId: vehicle.id, status: 'OPEN' } });
  if (!pool) pool = await prisma.pool.create({ data: { vehicleId: vehicle.id, status: 'OPEN' } });

  const bananiId = seededAreas.get('Banani')!;
  const demoMembers = [
    { name: 'Nusrat', drop: 'Mohakhali', fare: 9600 },
    { name: 'Rafiq', drop: 'Gulshan 1', fare: 7520 }
  ];
  for (const demo of demoMembers) {
    const passenger = users.get(demo.name)!;
    const ride = await prisma.rideRequest.findFirst({ where: { passengerId: passenger.id, status: { in: [RideStatus.MATCHED, RideStatus.DRIVER_ARRIVED, RideStatus.STARTED] } } });
    if (!ride) {
      const createdRide = await prisma.rideRequest.create({
        data: {
          passengerId: passenger.id,
          pickupAreaId: bananiId,
          dropoffAreaId: seededAreas.get(demo.drop)!,
          requestedSeats: 1,
          status: RideStatus.MATCHED,
          estimatedFare: demo.fare,
          history: { create: { fromStatus: null, toStatus: RideStatus.MATCHED, changedBy: driver.id } }
        }
      });
      await prisma.poolMembership.create({ data: { poolId: pool.id, rideId: createdRide.id, seats: 1, farePaisa: demo.fare } });
    }
  }
  const shirin = users.get('Shirin')!;
  const shirinPending = await prisma.rideRequest.findFirst({ where: { passengerId: shirin.id, status: RideStatus.REQUESTED } });
  if (!shirinPending) {
    await prisma.rideRequest.create({
      data: {
        passengerId: shirin.id,
        pickupAreaId: bananiId,
        dropoffAreaId: seededAreas.get('Gulshan 1')!,
        requestedSeats: 1,
        estimatedFare: 6500
      }
    });
  }
  console.log('Seeded Dhaka Tesla Pool actors, areas, Bullet, and sample rides.');
}

main().finally(() => prisma.$disconnect());
