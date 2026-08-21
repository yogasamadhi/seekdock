import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { TestRemote } from '@deepseek-ai/dsh-client-test-runtime'
import { apply as settingsApply, inject as settingsInject } from '@deepseek-ai/dsh-client-ui-settings/client'
import { apply, inject } from '../src/client/index.ts'
import { AgentBackendLabel, type AgentBackendLabelInjected } from '../src/client/AgentBackendLabel.tsx'
import { AgentBackendRow, type AgentBackendRowInjected } from '../src/client/AgentBackendRow.tsx'
import { AgentBackendSeat, type AgentBackendSeatInjected } from '../src/client/AgentBackendSeat.tsx'

const ROSTER = {
  rpcId: 'r',
  result: {
    ok: true as const,
    value: {
      backends: [
        { id: 'dsh' as never, name: 'DeepSeek Harness', isDefault: true },
        { id: 'pi' as never, name: 'Pi', isDefault: false },
      ],
    },
  },
}

function declareRoot(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: {
      'settings.general.item': { kind: 'list', scope: 'root' },
      conversation: { kind: 'single', scope: 'root' },
    },
  } as never, () => null)
}

function declareConversation(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'conversation',
    children: {
      'conversation.hero.agentBackend': { kind: 'single', scope: 'root' },
      'conversation.session.header.actions': { kind: 'list', scope: 'session' },
    },
  } as never, () => null)
}

function sessionsDouble(state: {
  current?: string
  byId: Record<string, { id: string; blank: boolean; agentBackend?: string }>
}) {
  const listeners = new Set<() => void>()
  return {
    list: {
      getSnapshot: () => state,
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
    noteAgentBackend: (sessionId: string, agentBackend: string) => {
      const summary = state.byId[sessionId]
      if (summary !== undefined) summary.agentBackend = agentBackend
    },
    notify: () => { for (const listener of listeners) listener() },
  }
}

async function bench(state: {
  current?: string
  byId: Record<string, { id: string; blank: boolean; agentBackend?: string }>
}) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  declareRoot(slots)
  declareConversation(slots)
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  new TestRemote(ctx)
  const calls: string[] = []
  ctx.provide('connection', {
    api: {
      agentBackends: {
        list: () => { calls.push('list'); return Promise.resolve(ROSTER) },
        select: (payload: { sessionId: string; agentBackend: string }) => {
          calls.push(`select:${payload.sessionId}:${payload.agentBackend}`)
          return Promise.resolve({
            rpcId: 'r', result: { ok: true as const, value: { agentBackend: payload.agentBackend } },
          })
        },
      },
      settings: {
        describe: () => Promise.resolve({
          rpcId: 'r',
          result: { ok: true as const, value: { writable: true, hasDocument: true, namespaces: [] } },
        }),
        update: (payload: { patch: unknown }) => {
          calls.push(`settings:${JSON.stringify(payload.patch)}`)
          return Promise.resolve({ rpcId: 'r', result: { ok: true as const, value: {} } })
        },
      },
    },
  } as never)
  const sessions = sessionsDouble(state)
  ctx.provide('sessions', sessions as never)
  ctx.provide('conversation', {} as never)
  await ctx.plugin({ inject: [...settingsInject], apply: settingsApply }).await()
  const fiber = ctx.plugin({ inject: [...inject, 'conversation', 'sessions'], apply })
  await fiber.await()
  return { ctx, fiber, slots, sessions, calls }
}

describe('ui-agent-backend apply', () => {
  it('declares its required browser services', () => {
    expect(inject).toEqual(['slots', 'locale', 'connection', 'remote', 'settingsScope'])
  })

  it('registers all three surfaces and routes their actions', async () => {
    const state = {
      current: 's1',
      byId: { s1: { id: 's1', blank: true, agentBackend: 'dsh' } },
    }
    const { fiber, slots, calls } = await bench(state)
    const rowEntry = slots.entries('settings.general.item')[0]!
    const seatEntry = slots.entries('conversation.hero.agentBackend')[0]!
    const labelEntry = slots.entries('conversation.session.header.actions')[0]!
    expect(rowEntry.component).toBe(AgentBackendRow)
    expect(rowEntry.options).toMatchObject({ id: 'agent-backend', order: -24 })
    expect(seatEntry.component).toBe(AgentBackendSeat)
    expect(labelEntry.component).toBe(AgentBackendLabel)
    expect(labelEntry.options).toMatchObject({ id: 'agent-backend', order: -11 })

    const row = (rowEntry.inject as unknown as () => AgentBackendRowInjected)()
    const seat = (seatEntry.inject as unknown as () => AgentBackendSeatInjected)()
    const label = (labelEntry.inject as unknown as () => AgentBackendLabelInjected)()
    await row.load()
    await row.select('pi')
    await seat.load()
    await seat.select('pi')
    await label.load()
    expect(calls).toContain('settings:{"defaultBackend":"pi"}')
    expect(calls).toContain('select:s1:pi')
    expect(state.byId.s1.agentBackend).toBe('pi')

    await fiber.dispose()
    expect(slots.entries('settings.general.item')).toHaveLength(0)
    expect(slots.entries('conversation.hero.agentBackend')).toHaveLength(0)
    expect(slots.entries('conversation.session.header.actions')).toHaveLength(0)
  })

  it('stages before a Session exists, applies on a list change, and refreshes only relevant settings', async () => {
    const state: {
      current?: string
      byId: Record<string, { id: string; blank: boolean; agentBackend?: string }>
    } = { byId: {} }
    const { ctx, slots, sessions, calls } = await bench(state)
    const seatEntry = slots.entries('conversation.hero.agentBackend')[0]!
    const seat = (seatEntry.inject as unknown as () => AgentBackendSeatInjected)()
    const rowEntry = slots.entries('settings.general.item')[0]!
    const row = (rowEntry.inject as unknown as () => AgentBackendRowInjected)()
    await seat.load()
    await seat.select('pi')
    expect(calls.some(call => call.startsWith('select:'))).toBe(false)

    state.current = 's2'
    state.byId.s2 = { id: 's2', blank: true }
    sessions.notify()
    await vi.waitFor(() => { expect(calls).toContain('select:s2:pi') })
    expect(state.byId.s2.agentBackend).toBe('pi')

    const before = calls.filter(call => call === 'list').length
    ctx.remote.$dispatch('settings/document-updated', ['llm-deepseek', 1])
    await Promise.resolve()
    expect(calls.filter(call => call === 'list')).toHaveLength(before)
    ctx.remote.$dispatch('settings/document-updated', ['agent-loop', 2])
    await vi.waitFor(() => {
      expect(calls.filter(call => call === 'list').length).toBe(before + 1)
    })
    await vi.waitFor(() => { expect(row.hooks.agentBackend.getSnapshot().status).toBe('ready') })
    ctx.emit('connection/reset')
    await vi.waitFor(() => {
      expect(calls.filter(call => call === 'list').length).toBe(before + 2)
    })
  })
})
