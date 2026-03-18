import { API_BASE_URL } from '@/lib/constants';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const resp = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  const data = await resp.json();

  if (!resp.ok) {
    throw new ApiError(
      resp.status,
      data?.error?.code ?? 'unknown',
      data?.error?.message ?? 'Request failed'
    );
  }

  return data as T;
}
