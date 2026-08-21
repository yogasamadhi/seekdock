import { useEffect, useState } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { AgentBackendSettingsState } from './store.ts'
import { BackendMenu } from './BackendMenu.tsx'
import css from './AgentBackendRow.module.css'

export interface AgentBackendRowInjected {
  hooks: { agentBackend: SnapshotStore<AgentBackendSettingsState> }
  load: () => Promise<void>
  select: (id: string) => Promise<void>
}

export type AgentBackendRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'settings.agentBackend'>
  & InjectFace<AgentBackendRowInjected>

/** Render the default Agent-backend setting. */
export function AgentBackendRow({ load, select, useAgentBackend, t }: AgentBackendRowProps) {
  const state = useAgentBackend(snapshot => snapshot)
  const [open, setOpen] = useState(false)
  useEffect(() => { void load() }, [load])
  if (state.status === 'unavailable') return null
  const chosen = state.options.find(option => option.id === state.current)
  const busy = state.status === 'loading' || state.status === 'saving'
  return (
    <div className={css.row}>
      <div className={css.rowText}>
        <div className={css.title}>{t('title')}</div>
        <div className={css.desc} role={state.error === null ? undefined : 'alert'}>
          {state.error ?? t('description')}
        </div>
      </div>
      <BackendMenu
        options={state.options}
        selectedId={state.current}
        label={chosen?.name ?? t('loading')}
        disabled={busy || !state.writable || state.options.length === 0}
        open={open}
        align="end"
        buttonClassName={css.selector}
        chevronClassName={css.chevron}
        onOpenChange={setOpen}
        onSelect={(id) => { void select(id) }}
      />
    </div>
  )
}
