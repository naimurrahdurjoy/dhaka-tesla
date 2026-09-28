export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) { super(message); }
}

export async function api<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.error?.message ?? 'Request failed. Please try again.', response.status, body.error?.code);
  return body as T;
}

export type Area = { id: string; name: string };
export type Ride = {
  id: string; status: string; estimatedFare: number; finalFare: number | null; requestedSeats: number;
  pickupArea: Area; dropoffArea: Area; createdAt: string;
  membership?: { poolId: string; farePaisa: number; pool?: { vehicle?: { driver?: { name: string } } } } | null;
};

export const money = (paisa: number) => `৳${(paisa / 100).toFixed(2)}`;
