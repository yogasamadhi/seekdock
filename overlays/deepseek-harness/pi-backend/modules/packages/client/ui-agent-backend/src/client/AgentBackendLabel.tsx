import { useEffect } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconAgentPresetOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { AgentBackendSettingsState } from './store.ts'
import css from './AgentBackendLabel.module.css'

export interface AgentBackendLabelInjected {
  hooks: { agentBackends: SnapshotStore<AgentBackendSettingsState> }
  load: () => Promise<void>
}

export type AgentBackendLabelProps =
  PropsRuntime<'conversation.session.header.actions'>
  & PropsLocale<'settings.agentBackend'>
  & InjectFace<AgentBackendLabelInjected>

/** Render the Agent backend currently driving this Session. */
export function AgentBackendLabel({ sessionId, useSessions, useAgentBackends, load, t }: AgentBackendLabelProps) {
  const backend = useSessions(state => state.byId[sessionId]?.agentBackend)
  const options = useAgentBackends(state => state.options)
  useEffect(() => { if (backend !== undefined) void load() }, [backend, load])
  if (backend === undefined) return null
  const option = options.find(entry => entry.id === backend)
  return (
    <span className={css.label} title={option?.description ?? t('headerHint')}>
      <IconAgentPresetOutline16 size={14} className={css.icon} />
      {option?.name ?? backend}
    </span>
  )
}
