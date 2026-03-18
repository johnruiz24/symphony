import { useDroppable } from '@dnd-kit/core';
import type { Agent } from '@/types/agent';
import { AgentCard } from './AgentCard';

interface AgentDropZoneProps {
  agent: Agent;
}

export function AgentDropZone({ agent }: AgentDropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `agent-${agent.id}`,
    data: { type: 'agent', agentId: agent.id },
  });

  return (
    <div ref={setNodeRef}>
      <AgentCard agent={agent} isOver={isOver} />
    </div>
  );
}
