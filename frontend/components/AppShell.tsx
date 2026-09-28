'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

export function AppShell({ children, name, role }: { children: React.ReactNode; name: string; role: 'DRIVER' | 'PASSENGER' }) {
  const router = useRouter();
  function signOut() {
    localStorage.removeItem('teslapool-session');
    router.push('/login');
  }
  return <div className="min-h-screen bg-paper">
    <header className="sticky top-0 z-20 border-b border-ink/5 bg-paper/90 backdrop-blur"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
      <Link href="/" className="flex items-center gap-3 font-bold"><span className="grid h-9 w-9 place-items-center rounded-xl bg-forest font-black text-mint">T</span><span className="tracking-tight">TESLA<span className="text-forest">POOL</span></span></Link>
      <div className="flex items-center gap-3"><span className="hidden text-right sm:block"><b className="block text-sm">{name}</b><small className="text-[10px] font-bold tracking-[.16em] text-slate-400">{role}</small></span><button onClick={signOut} className="rounded-full border border-ink/10 px-4 py-2 text-xs font-semibold hover:bg-white">Sign out</button></div>
    </div></header><main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12">{children}</main>
  </div>;
}
