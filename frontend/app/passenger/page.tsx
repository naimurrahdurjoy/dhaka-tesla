'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { api, ApiError, Area, money, Ride } from '@/lib/api';

type Session = { token: string; user: { id: string; name: string; role: 'PASSENGER' } };
type Pool = { id: string; status: string; occupiedSeats: number; vehicle: { name: string; capacity: number; driver: { name: string } }; members: Array<{ ride: Ride; seats: number }> };
const activeStatuses = ['REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED'];
const steps = ['REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED'];

export default function PassengerPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [rides, setRides] = useState<Ride[]>([]);
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [seats, setSeats] = useState(1);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async (auth: Session) => {
    const [areaList, poolList, dashboard] = await Promise.all([
      api<Area[]>('/areas', auth.token), api<Pool[]>('/pools', auth.token), api<{ rides: Ride[] }>('/passenger/dashboard', auth.token)
    ]);
    setAreas(areaList); setPools(poolList); setRides(dashboard.rides);
    setPickup((current) => current || areaList.find((area) => area.name === 'Banani')?.id || '');
    setDropoff((current) => current || areaList.find((area) => area.name === 'Mohakhali')?.id || '');
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem('teslapool-session');
    if (!raw) { router.replace('/login'); return; }
    const auth = JSON.parse(raw) as Session;
    if (auth.user.role !== 'PASSENGER') { router.replace('/driver'); return; }
    setSession(auth); void load(auth).catch((reason) => setError(reason.message));
    const timer = window.setInterval(() => void load(auth).catch(() => undefined), 5000);
    return () => window.clearInterval(timer);
  }, [router, load]);

  const activeRide = useMemo(() => rides.find((ride) => activeStatuses.includes(ride.status)), [rides]);
  const otherRides = rides.filter((ride) => ride.id !== activeRide?.id);
  async function createRide(event: FormEvent) {
    event.preventDefault(); if (!session) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const ride = await api<Ride>('/rides', session.token, { method: 'POST', body: JSON.stringify({ pickupAreaId: pickup, dropoffAreaId: dropoff, requestedSeats: seats }) });
      setNotice(`Request created · estimated fare ${money(ride.estimatedFare)}.`);
      await load(session);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to request a ride.'); }
    finally { setBusy(false); }
  }
  async function joinPool(poolId: string) {
    if (!session || !activeRide) return;
    setBusy(true); setError('');
    try { await api(`/pools/${poolId}/join`, session.token, { method: 'POST', body: JSON.stringify({ rideId: activeRide.id }) }); setNotice('Seat confirmed — your ride is matched with Jashim.'); await load(session); }
    catch (reason) { setError(reason instanceof ApiError && reason.code === 'POOL_CAPACITY_EXCEEDED' ? 'That last seat was just taken. Choose another pool or try again.' : reason instanceof Error ? reason.message : 'Could not join the pool.'); }
    finally { setBusy(false); }
  }
  async function cancelRide(rideId: string) {
    if (!session) return;
    try { await api(`/rides/${rideId}/cancel`, session.token, { method: 'POST' }); setNotice('Ride request cancelled.'); await load(session); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not cancel this ride.'); }
  }

  if (!session) return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Loading your ride…</div>;
  const statusIndex = activeRide ? steps.indexOf(activeRide.status) : -1;
  return <AppShell name={session.user.name} role="PASSENGER">
    <div className="mb-9 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-forest">Passenger · Banani, Dhaka</p><h1 className="mt-2 text-4xl font-semibold tracking-[-.05em]">Good commute, {session.user.name}.</h1><p className="mt-2 text-slate-500">A smoother ride is just a seat away.</p></div><span className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-forest">● Rush-hour pooling is live</span></div>
    {(error || notice) && <div role="status" className={`mb-5 rounded-2xl px-5 py-3 text-sm ${error ? 'bg-red-50 text-red-700' : 'bg-[#eaf3dc] text-forest'}`}>{error || notice}<button className="float-right font-bold" onClick={() => { setError(''); setNotice(''); }}>×</button></div>}
    <div className="grid gap-6 lg:grid-cols-[.82fr_1.18fr]">
      <section className="rounded-[1.75rem] bg-white p-6 shadow-card sm:p-8"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-forest">Start a shared ride</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Where are you headed?</h2></div><span className="grid h-11 w-11 place-items-center rounded-2xl bg-mint text-xl">↗</span></div><form onSubmit={createRide} className="mt-7 space-y-4"><label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Pickup<select required value={pickup} onChange={(event) => setPickup(event.target.value)} className="mt-2 block w-full rounded-xl border border-ink/10 bg-paper px-4 py-3.5 text-sm font-medium text-ink outline-none focus:border-forest">{areas.filter((area) => area.name === 'Banani').map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label><label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Drop-off<select required value={dropoff} onChange={(event) => setDropoff(event.target.value)} className="mt-2 block w-full rounded-xl border border-ink/10 bg-paper px-4 py-3.5 text-sm font-medium text-ink outline-none focus:border-forest">{areas.filter((area) => area.id !== pickup).map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label><div className="flex items-center justify-between rounded-xl bg-paper px-4 py-3"><div><p className="text-sm font-semibold">Seats requested</p><p className="text-xs text-slate-400">Bullet carries 3 passengers max</p></div><select value={seats} onChange={(event) => setSeats(Number(event.target.value))} className="rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm font-semibold">{[1, 2, 3].map((n) => <option key={n}>{n}</option>)}</select></div><button disabled={busy || !areas.length} className="w-full rounded-full bg-forest py-4 text-sm font-bold text-white hover:bg-ink disabled:opacity-50">{busy ? 'Finding your route…' : 'Request a seat'} <span className="ml-2 text-mint">→</span></button></form><p className="mt-4 text-center text-xs text-slate-400">Fares shown in BDT · stored securely in paisa</p></section>
      <section className="rounded-[1.75rem] bg-[#e9eee6] p-6 sm:p-8"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-forest">Your trip</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Ride status</h2></div>{activeRide && <span className="rounded-full bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-forest">{activeRide.status.replace('_', ' ')}</span>}</div>
        {!activeRide ? <div className="mt-6 rounded-2xl border border-dashed border-forest/20 bg-white/60 p-8 text-center"><span className="text-3xl">⌁</span><p className="mt-3 font-semibold">No active ride yet</p><p className="mt-1 text-sm text-slate-500">Request a seat and we’ll track your trip here.</p></div> : <div className="mt-6 rounded-2xl bg-white p-5 sm:p-6"><div className="flex items-center justify-between"><div><p className="text-xs text-slate-400">ROUTE</p><p className="mt-1 font-semibold">{activeRide.pickupArea.name} <span className="text-forest">→</span> {activeRide.dropoffArea.name}</p></div><div className="text-right"><p className="text-xs text-slate-400">YOUR FARE</p><p className="mt-1 font-bold">{money(activeRide.membership?.farePaisa ?? activeRide.estimatedFare)}</p></div></div><div className="my-7 flex items-start">{steps.map((step, index) => <div key={step} className="relative flex flex-1 flex-col items-center"><span className={`z-10 grid h-7 w-7 place-items-center rounded-full text-[10px] font-bold ${index <= statusIndex ? 'bg-forest text-white' : 'border border-slate-200 bg-white text-slate-400'}`}>{index <= statusIndex ? '✓' : index + 1}</span>{index < steps.length - 1 && <span className={`absolute left-1/2 top-3.5 h-0.5 w-full ${index < statusIndex ? 'bg-forest' : 'bg-slate-200'}`}/>}<small className="mt-2 text-center text-[9px] font-semibold text-slate-400 sm:text-[10px]">{step.replace('_', ' ')}</small></div>)}</div>{activeRide.status === 'REQUESTED' && <div className="rounded-xl bg-[#f5f6f1] p-4"><p className="text-sm font-semibold">Choose an open pool</p><p className="mb-3 mt-1 text-xs text-slate-500">Jashim’s Bullet is ready with {pools[0] ? 3 - pools[0].occupiedSeats : 0} seat(s) free.</p>{pools.filter((pool) => pool.status === 'OPEN' && pool.occupiedSeats + activeRide.requestedSeats <= pool.vehicle.capacity).map((pool) => <button key={pool.id} disabled={busy} onClick={() => void joinPool(pool.id)} className="w-full rounded-full bg-forest px-4 py-3 text-xs font-bold text-white disabled:opacity-50">Join {pool.vehicle.name} · {pool.occupiedSeats}/{pool.vehicle.capacity} seats filled</button>)}{!pools.some((pool) => pool.status === 'OPEN' && pool.occupiedSeats + activeRide.requestedSeats <= pool.vehicle.capacity) && <p className="text-xs text-amber-700">No pool has enough seats right now.</p>}</div>}{activeRide.status !== 'STARTED' && <button onClick={() => void cancelRide(activeRide.id)} className="mt-4 text-xs font-semibold text-slate-400 hover:text-red-600">Cancel request</button>}</div>}
      </section>
    </div>
    <section className="mt-8 rounded-[1.75rem] bg-white p-6 shadow-card sm:p-8"><div className="flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-forest">Your journeys</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Ride history</h2></div><span className="text-xs text-slate-400">Updates every few seconds</span></div>{otherRides.length === 0 ? <p className="mt-6 rounded-xl bg-paper p-5 text-sm text-slate-500">Completed rides and past requests will show here.</p> : <div className="mt-5 divide-y divide-ink/5">{otherRides.map((ride) => <div key={ride.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="font-semibold">{ride.pickupArea.name} <span className="text-forest">→</span> {ride.dropoffArea.name}</p><p className="mt-1 text-xs text-slate-400">{new Date(ride.createdAt).toLocaleDateString()} · {ride.status.replace('_', ' ')}</p></div><span className="text-sm font-bold">{money(ride.finalFare ?? ride.estimatedFare)}</span></div>)}</div>}</section>
  </AppShell>;
}
