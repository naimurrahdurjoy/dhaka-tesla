'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { api, money, Ride } from '@/lib/api';

type Session = { token: string; user: { id: string; name: string; role: 'DRIVER' } };
type Member = { id: string; seats: number; farePaisa: number; ride: Ride & { passenger: { name: string } } };
type Pool = { id: string; status: string; occupiedSeats: number; members: Member[] };
type Dashboard = { vehicle: { id: string; name: string; capacity: number; isOnline: boolean }; totalEarningsPaisa?: number; pools: Pool[]; requests: Array<Ride & { passenger: { name: string } }> };

export default function DriverPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async (auth: Session) => setDashboard(await api<Dashboard>('/driver/dashboard', auth.token)), []);
  useEffect(() => {
    const raw = localStorage.getItem('teslapool-session');
    if (!raw) { router.replace('/login'); return; }
    const auth = JSON.parse(raw) as Session;
    if (auth.user.role !== 'DRIVER') { router.replace('/passenger'); return; }
    setSession(auth); void load(auth).catch((reason) => setError(reason.message));
    const timer = window.setInterval(() => void load(auth).catch(() => undefined), 5000);
    return () => window.clearInterval(timer);
  }, [router, load]);

  async function setOnline(isOnline: boolean) {
    if (!session) return;
    setBusyId('online'); setError('');
    try { await api('/driver/online', session.token, { method: 'POST', body: JSON.stringify({ isOnline }) }); setNotice(isOnline ? 'You are online and ready for a ride.' : 'You are offline. New ride requests are paused.'); await load(session); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update availability.'); }
    finally { setBusyId(''); }
  }
  async function runAction(path: string, id: string, success: string) {
    if (!session) return;
    setBusyId(id); setError(''); setNotice('');
    try { await api(path, session.token, { method: 'POST' }); setNotice(success); await load(session); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Action failed.'); }
    finally { setBusyId(''); }
  }
  if (!session || !dashboard) return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Loading driver dashboard…</div>;
  const pool = dashboard.pools.find((item) => item.status === 'OPEN' || item.status === 'IN_PROGRESS') ?? dashboard.pools[0];
  const occupied = pool?.occupiedSeats ?? 0;
  const totalEarningsPaisa = typeof dashboard.totalEarningsPaisa === 'number' && Number.isFinite(dashboard.totalEarningsPaisa) ? dashboard.totalEarningsPaisa : 0;
  const actionFor: Record<string, { endpoint: string; label: string; next: string }> = {
    MATCHED: { endpoint: 'arrive', label: 'Mark arrived', next: 'DRIVER_ARRIVED' },
    DRIVER_ARRIVED: { endpoint: 'start', label: 'Start trip', next: 'STARTED' },
    STARTED: { endpoint: 'complete', label: 'Complete trip', next: 'COMPLETED' }
  };
  return <AppShell name={session.user.name} role="DRIVER">
    <div className="mb-9 flex flex-wrap items-end justify-between gap-5"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-forest">Driver workspace · rush hour</p><h1 className="mt-2 text-4xl font-semibold tracking-[-.05em]">Good morning, {session.user.name}.</h1><p className="mt-2 text-slate-500">Your Bullet is ready to make the commute count.</p></div><button onClick={() => void setOnline(!dashboard.vehicle.isOnline)} disabled={busyId === 'online'} className={`flex items-center gap-3 rounded-full px-5 py-3 text-sm font-bold shadow-sm transition ${dashboard.vehicle.isOnline ? 'bg-[#e4f2da] text-forest' : 'bg-white text-slate-500'}`}><span className={`h-2.5 w-2.5 rounded-full ${dashboard.vehicle.isOnline ? 'bg-lime-500' : 'bg-slate-300'}`}/>{dashboard.vehicle.isOnline ? 'Online' : 'Go online'}<span className="ml-2 text-xs">⌁</span></button></div>
    {(error || notice) && <div className={`mb-5 rounded-2xl px-5 py-3 text-sm ${error ? 'bg-red-50 text-red-700' : 'bg-[#eaf3dc] text-forest'}`}>{error || notice}<button className="float-right font-bold" onClick={() => { setError(''); setNotice(''); }}>×</button></div>}
    <section aria-label="Driver earnings" className="mb-8 rounded-[1.5rem] border border-ink/5 bg-white px-6 py-5 shadow-card sm:px-8"><p className="text-xs font-bold uppercase tracking-[.16em] text-forest">Total earnings</p><p className="mt-2 text-3xl font-semibold tracking-tight">{money(totalEarningsPaisa)}</p><p className="mt-1 text-sm text-slate-500">Completed rides · Taka</p></section>
    <div className="grid gap-6 lg:grid-cols-[.85fr_1.15fr]">
      <section className="rounded-[1.75rem] bg-forest p-6 text-white shadow-card sm:p-8"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-mint">Your vehicle</p><h2 className="mt-2 text-3xl font-semibold">{dashboard.vehicle.name}</h2><p className="mt-1 text-sm text-white/60">Electric 3-wheeler · Banani</p></div><span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-2xl">⚡</span></div><div className="mt-8 rounded-2xl bg-white/10 p-5"><div className="flex items-center justify-between"><div><p className="text-xs text-white/60">SEAT CAPACITY</p><p className="mt-1 text-2xl font-bold">{occupied}<span className="text-white/45"> / {dashboard.vehicle.capacity}</span></p></div><span className="rounded-full bg-mint px-3 py-1.5 text-xs font-bold text-forest">{dashboard.vehicle.capacity - occupied} open</span></div><div className="mt-5 flex gap-2">{Array.from({ length: dashboard.vehicle.capacity }, (_, index) => <div key={index} className={`h-2 flex-1 rounded-full ${index < occupied ? 'bg-mint' : 'bg-white/20'}`}/>)}</div><div className="mt-4 flex -space-x-2">{pool?.members.map((member, index) => <span key={member.id} className={`grid h-9 w-9 place-items-center rounded-full border-2 border-forest text-xs font-bold text-ink ${['bg-[#f7c8a7]', 'bg-[#b8d8d0]', 'bg-mint'][index % 3]}`} title={member.ride.passenger.name}>{member.ride.passenger.name[0]}</span>)}{Array.from({ length: Math.max(0, dashboard.vehicle.capacity - occupied) }, (_, index) => <span key={`empty-${index}`} className="grid h-9 w-9 place-items-center rounded-full border-2 border-dashed border-white/25 bg-white/5 text-xs text-white/45">+</span>)}</div></div><div className="mt-6 flex items-center justify-between border-t border-white/15 pt-5"><span className="text-sm text-white/65">Today’s pooled riders</span><b>{pool?.members.length ?? 0}</b></div></section>
      <section className="rounded-[1.75rem] bg-white p-6 shadow-card sm:p-8"><div className="flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-forest">Passenger roster</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Current pool</h2></div><span className="rounded-full bg-paper px-3 py-1.5 text-xs font-semibold text-slate-500">{pool?.status ?? 'No active pool'}</span></div>{!pool?.members.length ? <div className="mt-6 rounded-2xl bg-paper p-6 text-sm text-slate-500">No passengers have joined yet. New matches will appear here.</div> : <div className="mt-5 divide-y divide-ink/5">{pool.members.map((member) => { const ride = member.ride; const action = actionFor[ride.status]; return <div key={member.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#e8ede6] text-sm font-bold">{ride.passenger.name[0]}</span><div><p className="font-semibold">{ride.passenger.name} <span className="ml-1 text-xs font-normal text-slate-400">· {member.seats} seat</span></p><p className="mt-1 text-xs text-slate-500">{ride.pickupArea.name} → {ride.dropoffArea.name} · {ride.status.replace('_', ' ')}</p></div></div><div className="flex items-center gap-3">{action ? <button disabled={busyId === ride.id} onClick={() => void runAction(`/rides/${ride.id}/${action.endpoint}`, ride.id, `${ride.passenger.name} updated to ${action.next.replace('_', ' ')}.`)} className="rounded-full bg-forest px-4 py-2.5 text-xs font-bold text-white hover:bg-ink disabled:opacity-50">{action.label} →</button> : <span className="text-xs font-semibold text-forest">{ride.status === 'COMPLETED' ? 'Trip complete ✓' : 'Ready'}</span>}<span className="text-xs font-bold text-slate-500">{money(member.farePaisa)}</span></div></div>; })}</div>}</section>
    </div>
    <section className="mt-8 rounded-[1.75rem] bg-white p-6 shadow-card sm:p-8"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-forest">Ride matching</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Waiting passengers</h2></div><span className="text-xs text-slate-400">{dashboard.requests.length} request{dashboard.requests.length === 1 ? '' : 's'}</span></div>{!dashboard.requests.length ? <p className="mt-5 rounded-xl bg-paper p-5 text-sm text-slate-500">You’re all caught up. New Banani requests show up here automatically.</p> : <div className="mt-4 divide-y divide-ink/5">{dashboard.requests.map((ride) => <div key={ride.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div><p className="font-semibold">{ride.passenger.name} <span className="ml-2 rounded-full bg-paper px-2 py-1 text-[10px] font-bold uppercase text-slate-500">{ride.requestedSeats} seat{ride.requestedSeats > 1 ? 's' : ''}</span></p><p className="mt-1 text-sm text-slate-500">{ride.pickupArea.name} → {ride.dropoffArea.name} <span className="mx-1">·</span> {money(ride.estimatedFare)}</p></div><button disabled={!dashboard.vehicle.isOnline || busyId === ride.id || occupied + ride.requestedSeats > dashboard.vehicle.capacity} onClick={() => void runAction(`/rides/${ride.id}/accept`, ride.id, `${ride.passenger.name} added to the pool.`)} className="rounded-full border border-forest/20 px-5 py-2.5 text-xs font-bold text-forest hover:bg-[#eaf3dc] disabled:cursor-not-allowed disabled:opacity-40">Accept request ↗</button></div>)}</div>}</section>
    <p className="mt-6 text-center text-xs text-slate-400">Dashboard refreshes every five seconds · All fares are managed in integer paisa.</p>
  </AppShell>;
}
