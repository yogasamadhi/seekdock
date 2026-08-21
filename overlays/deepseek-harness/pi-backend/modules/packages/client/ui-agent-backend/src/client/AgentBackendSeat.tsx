import { useEffect, useState } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconAgentPresetOutline16, IconChevronDownOutline14, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { AgentBackendSeatState } from './store.ts'
import css from './AgentBackendSeat.module.css'

export interface AgentBackendSeatInjected {
  hooks: { agentBackendSeat: SnapshotStore<AgentBackendSeatState> }
  load: () => Promise<void>
  select: (id: string) => Promise<void>
}

export type AgentBackendSeatProps =
  PropsRuntime<'conversation.hero.agentBackend'>
  & PropsLocale<'settings.agentBackend'>
  & InjectFace<AgentBackendSeatInjected>

/** Render the backend picker for the blank/new-Session flow. */
export function AgentBackendSeat({ load, select, useAgentBackendSeat, t }: AgentBackendSeatProps) {
  const state = useAgentBackendSeat(snapshot => snapshot)
  const [open, setOpen] = useState(false)
  useEffect(() => { void load() }, [load])
  const chosen = state.options.find(option => option.id === state.current)
  if (chosen === undefined) return null
  /* jscpd:ignore-start -- backend and preset seats deliberately share the
     product's one new-Session menu interaction contract. */
  return (
    <Menu
      open={open}
      onClose={() => { setOpen(false) }}
      items={state.options.map(option => ({
        id: option.id,
        label: (
          <span className={css.item}>
            <span className={css.itemName}>{option.name}</span>
            <span className={css.itemDesc}>{option.description ?? t('noDescription')}</span>
          </span>
        ),
      }))}
      selectedId={state.current}
      onSelect={(id) => { setOpen(false); void select(id) }}
      align="start"
      portal
      anchor={(
        <button
          type="button"
          className={css.seat}
          aria-haspopup="menu"
          aria-expanded={open}
          title={state.error ?? t('seatHint')}
          disabled={state.busy}
          onClick={() => { setOpen(value => !value) }}
        >
          <IconAgentPresetOutline16 className={css.icon} />
          {chosen.name}
          <IconChevronDownOutline14 className={css.chevron} />
        </button>
      )}
    />
  )
  /* jscpd:ignore-end */
}
