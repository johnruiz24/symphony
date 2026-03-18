import { useQuery } from '@tanstack/react-query';
import { fetchTasks } from '@/api/tasks';
import type { TaskStatus } from '@/types/task';

interface UseTasksOptions {
  status?: TaskStatus;
  assignee?: string;
}

export function useTasks(options?: UseTasksOptions) {
  return useQuery({
    queryKey: ['tasks', options],
    queryFn: () => fetchTasks(options),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });
}
