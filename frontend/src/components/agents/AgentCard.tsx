import { memo } from 'react';
import type { Agent } from '@/types/agent';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { formatUptime } from '@/lib/formatters';

interface AgentCardProps {
  agent: Agent;
  isOver?: boolean;
}

export const AgentCard = memo(function AgentCard({ agent, isOver }: AgentCardProps) {
  return (
    <div
      className={`flex flex-col items-center gap-1 rounded-lg border bg-white px-4 py-2 shadow-sm transition-all ${
        isOver ? 'ring-2 ring-accent scale-105 bg-accent-soft/30' : ''
      }`}
    >
      <span className="text-sm font-medium text-ink">{agent.name}</span>
      <StatusBadge status={agent.status} />
      <div className="flex gap-3 text-xs text-muted">
        <span title="Active tasks">{agent.workload.active} active</span>
        <span title="Queued tasks">{agent.workload.queued} queued</span>
        <span title="Completed tasks">{agent.workload.completed} done</span>
      </div>
      <span className="text-xs text-muted">{formatUptime(agent.uptime_seconds)}</span>
    </div>
  );
});
