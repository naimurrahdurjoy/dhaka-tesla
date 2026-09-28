'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

type Actor = { label: string; name: string; email: string; role: 'DRIVER' | 'PASSENGER'; emoji: string };
const actors: Actor[] = [
  { label: 'Jashim', name: 'Jashim', email: 'driver@teslapool.demo', role: 'DRIVER', emoji: '⚡' },
  { label: 'Nusrat', name: 'Nusrat', email: 'passenger1@teslapool.demo', role: 'PASSENGER', emoji: 'N' },
  { label: 'Rafiq', name: 'Rafiq', email: 'passenger2@teslapool.demo', role: 'PASSENGER', emoji: 'R' },
  { label: 'Shirin', name: 'Shirin', email: 'passenger3@teslapool.demo', role: 'PASSENGER', emoji: 'S' }
];

export default function LoginPage() {
  const router = useRouter();
  const [selected, setSelected] = useState(actors[1]);
  const [email, setEmail] = useState(actors[1].email);
  const [password, setPassword] = useState('tesla2026');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const session = await api<{ token: string; user: { id: string; name: string; role: 'DRIVER' | 'PASSENGER'; email: string } }>('/auth/login', undefined, { method: 'POST', body: JSON.stringify({ email, password }) });
      localStorage.setItem('teslapool-session', JSON.stringify(session));
      router.push(session.user.role === 'DRIVER' ? '/driver' : '/passenger');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not sign in.'); }
    finally { setBusy(false); }
  }
  function choose(actor: Actor) { setSelected(actor); setEmail(actor.email); setPassword('tesla2026'); setError(''); }
  return <main className="grid min-h-screen bg-paper lg:grid-cols-[1fr_.88fr]">
    <section className="relative hidden overflow-hidden bg-forest p-12 text-white lg:flex lg:flex-col lg:justify-between"><Link href="/" className="flex items-center gap-3 font-bold"><span className="grid h-10 w-10 place-items-center rounded-xl bg-mint text-xl text-forest">T</span>TESLAPOOL</Link><div className="relative z-10 max-w-xl pb-12"><p className="mb-5 text-xs font-bold uppercase tracking-[.2em] text-mint">Your seat is waiting</p><h1 className="text-6xl font-semibold leading-[1.03] tracking-[-.05em]">The city feels closer when we ride together.</h1><p className="mt-6 max-w-md leading-7 text-white/65">One little electric Bullet. Three seats. A smarter way to move through Dhaka.</p><div className="mt-10 flex -space-x-3">{actors.slice(1).map((actor, index) => <span key={actor.name} className={`grid h-12 w-12 place-items-center rounded-full border-2 border-forest font-bold text-ink ${['bg-[#f7c8a7]', 'bg-[#b8d8d0]', 'bg-mint'][index]}`}>{actor.emoji}</span>)}<span className="grid h-12 w-12 place-items-center rounded-full border-2 border-forest bg-white/10 text-sm">+you</span></div></div><p className="text-xs text-white/40">Banani, Dhaka · Electric shared rides</p><div className="absolute -bottom-28 -right-24 h-96 w-96 rounded-full border border-white/10"/><div className="absolute -bottom-16 -right-12 h-72 w-72 rounded-full border border-white/10"/></section>
    <section className="flex items-center justify-center px-5 py-12"><div className="w-full max-w-md"><Link href="/" className="mb-10 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 lg:hidden">← Dhaka Tesla Pool</Link><p className="text-xs font-bold uppercase tracking-[.18em] text-forest">Welcome aboard</p><h2 className="mt-3 text-4xl font-semibold tracking-[-.04em]">Sign in to Tesla Pool</h2><p className="mt-3 text-sm text-slate-500">Choose a demo actor or use your account credentials.</p><div className="mt-8 grid grid-cols-4 gap-2">{actors.map((actor) => <button key={actor.name} onClick={() => choose(actor)} className={`rounded-2xl border p-3 text-center transition ${selected.name === actor.name ? 'border-forest bg-white shadow-sm' : 'border-transparent bg-white/60 hover:bg-white'}`}><span className={`mx-auto grid h-9 w-9 place-items-center rounded-full text-sm font-bold text-ink ${actor.role === 'DRIVER' ? 'bg-mint' : 'bg-[#e8ede6]'}`}>{actor.emoji}</span><span className="mt-2 block text-xs font-semibold">{actor.label}</span></button>)}</div><form onSubmit={submit} className="mt-7 space-y-4"><label className="block text-sm font-semibold">Email address<input autoComplete="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-2xl border border-ink/10 bg-white px-4 py-3.5 text-sm outline-none focus:border-forest"/></label><label className="block text-sm font-semibold">Password<input autoComplete="current-password" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-2xl border border-ink/10 bg-white px-4 py-3.5 text-sm outline-none focus:border-forest"/></label>{error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}<button disabled={busy} className="w-full rounded-full bg-forest py-4 text-sm font-bold text-white transition hover:bg-ink disabled:opacity-60">{busy ? 'Signing in…' : 'Continue'} <span className="ml-2 text-mint">↗</span></button></form><p className="mt-5 text-center text-xs text-slate-400">Demo password for all actors: <b>tesla2026</b></p></div></section>
  </main>;
}
