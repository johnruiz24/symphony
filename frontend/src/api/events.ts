import { API_BASE_URL } from '@/lib/constants';

const SSE_URL = `${API_BASE_URL}/api/v1/events`;

export function createEventSource(): EventSource {
  return new EventSource(SSE_URL);
}
