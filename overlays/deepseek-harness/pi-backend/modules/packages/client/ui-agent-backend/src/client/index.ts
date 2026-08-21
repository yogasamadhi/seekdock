import type { AgentBackendId, ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { AgentBackendLabel, type AgentBackendLabelInjected } from './AgentBackendLabel.tsx'
import { AgentBackendRow, type AgentBackendRowInjected } from './AgentBackendRow.tsx'
import { AgentBackendSeat, type AgentBackendSeatInjected } from './AgentBackendSeat.tsx'
import {
  AGENT_BACKEND_SETTINGS_NS,
  AgentBackendSeatController,
  AgentBackendSettingsController,
} from './store.ts'
import { en, zh } from './locales.ts'

export type { AgentBackendLabelInjected, AgentBackendLabelProps } from './AgentBackendLabel.tsx'
export type { AgentBackendRowInjected, AgentBackendRowProps } from './AgentBackendRow.tsx'
export type { AgentBackendSeatInjected, AgentBackendSeatProps } from './AgentBackendSeat.tsx'
export type {
  AgentBackendOption, AgentBackendSeatState, AgentBackendSettingsState, BackendSeatSession,
} from './store.ts'
export { AGENT_BACKEND_SETTINGS_NS } from './store.ts'

/** Required browser services. */
export const inject = ['slots', 'locale', 'connection', 'remote', 'settingsScope']

/** Mount the default, hero, and current-Session Agent-backend surfaces. */
export function apply(ctx: ClientContext): void {
  const api = (ctx.get('connection') as ConnectionHandle).api
  const settings = new AgentBackendSettingsController(api, ctx.settingsScope.describe())
  ctx.effect(() => ctx.locale.register('settings.agentBackend', { zh, en }), 'ui-agent-backend: dictionaries')

  const rowInjected = (): AgentBackendRowInjected => ({
    hooks: { agentBackend: settings.store },
    load: () => settings.load(),
    select: (id: string) => settings.select(id as AgentBackendId),
  })

  ctx.effect(() => {
    const refresh = (): void => { void settings.load() }
    const disposers = [
      ctx.remote.$on('settings/document-updated', (ns) => {
        if (ns === AGENT_BACKEND_SETTINGS_NS) refresh()
      }),
      ctx.on('connection/reset', refresh),
    ]
    return () => { for (const dispose of disposers) dispose() }
  }, 'ui-agent-backend: settings refresh')

  ctx.inject(['slots', 'conversation', 'sessions'], (scope: ClientContext) => {
    const seat = new AgentBackendSeatController(api, () => {
      const state = scope.sessions.list.getSnapshot()
      const summary = state.current === undefined ? undefined : state.byId[state.current]
      return summary === undefined
        ? undefined
        : {
          id: summary.id,
          blank: summary.blank,
          ...summary.agentBackend === undefined ? {} : { agentBackend: summary.agentBackend },
        }
    }, (sessionId, backend) => {
      scope.sessions.noteAgentBackend(sessionId, backend)
    })

    const seatInjected = (): AgentBackendSeatInjected => ({
      hooks: { agentBackendSeat: seat.store },
      load: () => seat.load(),
      select: (id: string) => seat.select(id as AgentBackendId),
    })
    const labelInjected = (): AgentBackendLabelInjected => ({
      hooks: { agentBackends: settings.store },
      load: () => settings.load(),
    })

    scope.effect(() => {
      const stop = scope.sessions.list.subscribe(() => { void seat.apply() })
      const chip = scope.slots.register({
        name: 'conversation.hero.agentBackend',
        locale: 'settings.agentBackend',
        inject: seatInjected,
      }, AgentBackendSeat)
      const label = scope.slots.register({
        name: 'conversation.session.header.actions',
        id: 'agent-backend',
        order: -11,
        locale: 'settings.agentBackend',
        inject: labelInjected,
      }, AgentBackendLabel)
      return () => { stop(); chip(); label() }
    }, 'ui-agent-backend: hero and header')
  })

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'agent-backend',
    order: -24,
    locale: 'settings.agentBackend',
    inject: rowInjected,
  }, AgentBackendRow))
}
