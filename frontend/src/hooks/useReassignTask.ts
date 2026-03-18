import { useMutation, useQueryClient } from '@tanstack/react-query';
import { reassignTask } from '@/api/tasks';
import type { Task } from '@/types/task';

export function useReassignTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, agentId }: { taskId: string; agentId: string }) =>
      reassignTask(taskId, agentId),

    onMutate: async ({ taskId, agentId }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] });
      const previousTasks = queryClient.getQueryData<Task[]>(['tasks']);

      queryClient.setQueryData<Task[]>(['tasks'], (old) =>
        old?.map((t) =>
          t.id === taskId ? { ...t, assigned_agent: agentId } : t
        )
      );

      return { previousTasks };
    },

    onError: (_err, _vars, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks'], context.previousTasks);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });
}
