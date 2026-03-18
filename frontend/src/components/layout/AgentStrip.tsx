import { useAgents } from '@/hooks/useAgents';
import { AgentDropZone } from '@/components/agents/AgentDropZone';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { ErrorBanner } from '@/components/shared/ErrorBanner';

export function AgentStrip() {
  const { data: agents, isLoading, error, refetch } = useAgents();

  if (isLoading) {
    return (
      <div className="flex h-20 items-center justify-center border-b border-line bg-white">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-20 items-center justify-center border-b border-line bg-white px-4">
        <ErrorBanner message="Failed to load agents" onRetry={() => refetch()} />
      </div>
    );
  }

  if (!agents || agents.length === 0) {
    return (
      <div className="flex h-20 items-center justify-center border-b border-line bg-white">
        <span className="text-sm text-muted">No active agents</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 overflow-x-auto border-b border-line bg-white px-4 py-2">
      <span className="flex-shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">
        Agents
      </span>
      {agents.map((agent) => (
        <AgentDropZone key={agent.id} agent={agent} />
      ))}
    </div>
  );
}
