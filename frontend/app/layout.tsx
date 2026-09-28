import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Dhaka Tesla Pool — Share the ride, skip the rush',
  description: 'Electric shared rides across Banani and Dhaka.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
