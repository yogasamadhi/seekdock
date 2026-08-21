/** Agent-backend settings and blank-Session selection controllers. */

import { describe, expect, it } from 'vitest'
import type { AgentBackendId, IApiClient } from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import {
  AGENT_BACKEND_SETTINGS_NS,
  AgentBackendSeatController,
  AgentBackendSettingsController,
} from '../src/client/store.ts'

const id = (value: string): AgentBackendId => value as AgentBackendId

function settingsFace(writable = true) {
  return {
    ensure: () => Promise.resolve(),
    getSnapshot: () => ({ view: { writable } }),
  } as never
}

function backendRoster() {
  return [
    { id: id('dsh'), name: 'DeepSeek Harness', description: 'Built-in loop', isDefault: true },
    { id: id('pi'), name: 'Pi', description: 'Pi loop', isDefault: false },
  ]
}

describe('AgentBackendSettingsController', () => {
  it('loads the roster and persists only the default backend field', async () => {
    let defaultBackend = id('dsh')
    const writes: unknown[] = []
    const api = {
      agentBackends: {
        list: () => Promise.resolve({
          rpcId: 'r',
          result: {
            ok: true as const,
            value: {
              backends: backendRoster().map(backend => ({ ...backend, isDefault: backend.id === defaultBackend })),
            },
          },
        }),
      },
      settings: {
        update: ({ ns, patch }: { ns: string; patch: { defaultBackend: AgentBackendId } }) => {
          writes.push({ ns, patch })
          defaultBackend = patch.defaultBackend
          return Promise.resolve({ rpcId: 'r', result: { ok: true as const, value: {} } })
        },
      },
    } as unknown as IApiClient
    const controller = new AgentBackendSettingsController(api, settingsFace())

    await controller.load()
    await controller.select(id('pi'))

    expect(writes).toEqual([{ ns: AGENT_BACKEND_SETTINGS_NS, patch: { defaultBackend: 'pi' } }])
    expect(controller.store.getSnapshot()).toMatchObject({ status: 'ready', current: 'pi', writable: true })
  })

  it('rolls back an optimistic value when the settings write is rejected', async () => {
    const api = {
      agentBackends: {
        list: () => Promise.resolve({ rpcId: 'r', result: { ok: true as const, value: { backends: backendRoster() } } }),
      },
      settings: {
        update: () => Promise.resolve({
          rpcId: 'r',
          result: { ok: false as const, error: { code: 'settings-rejected', message: 'read only', details: {} } },
        }),
      },
    } as unknown as IApiClient
    const controller = new AgentBackendSettingsController(api, settingsFace())
    await controller.load()

    await controller.select(id('pi'))

    expect(controller.store.getSnapshot()).toMatchObject({ status: 'ready', current: 'dsh', error: 'read only' })
  })

  it('reports an empty roster as unavailable and honors read-only settings', async () => {
    const api = {
      agentBackends: {
        list: () => Promise.resolve({ rpcId: 'r', result: { ok: true as const, value: { backends: [] } } }),
      },
    } as unknown as IApiClient
    const empty = new AgentBackendSettingsController(api, settingsFace(false))
    await empty.load()
    expect(empty.store.getSnapshot()).toMatchObject({ status: 'unavailable', options: [] })

    const readOnly = new AgentBackendSettingsController({
      agentBackends: {
        list: () => Promise.resolve({ rpcId: 'r', result: { ok: true as const, value: { backends: backendRoster() } } }),
      },
    } as unknown as IApiClient, settingsFace(false))
    await readOnly.load()
    expect(readOnly.store.getSnapshot().writable).toBe(false)
  })

  it('reports roster failures and falls back to the first row when none is default', async () => {
    const rejected = new AgentBackendSettingsController({
      agentBackends: {
        list: () => Promise.resolve({
          rpcId: 'r',
          result: { ok: false as const, error: { code: 'internal', message: 'host down', details: {} } },
        }),
      },
    } as unknown as IApiClient, settingsFace())
    await rejected.load()
    expect(rejected.store.getSnapshot()).toMatchObject({ status: 'error', error: 'host down' })

    const disconnected = new AgentBackendSettingsController({
      agentBackends: { list: () => Promise.reject(new Error('socket closed')) },
    } as unknown as IApiClient, settingsFace())
    await disconnected.load()
    expect(disconnected.store.getSnapshot()).toMatchObject({ status: 'error', error: 'socket closed' })

    const noDefault = new AgentBackendSettingsController({
      agentBackends: {
        list: () => Promise.resolve({
          rpcId: 'r',
          result: {
            ok: true as const,
            value: { backends: backendRoster().map(backend => ({ ...backend, isDefault: false })) },
          },
        }),
      },
    } as unknown as IApiClient, {
      ensure: () => Promise.resolve(),
      getSnapshot: () => ({}),
    } as never)
    await noDefault.load()
    expect(noDefault.store.getSnapshot()).toMatchObject({ current: 'dsh', writable: false })
  })

  it('coalesces concurrent loads and ignores a current or in-flight pick', async () => {
    const listed = Promise.withResolvers<ReturnType<IApiClient['agentBackends']['list']> extends Promise<infer T> ? T : never>()
    const saved = Promise.withResolvers<ReturnType<IApiClient['settings']['update']> extends Promise<infer T> ? T : never>()
    const calls = { list: 0, update: 0 }
    const api = {
      agentBackends: {
        list: () => {
          calls.list++
          if (calls.list === 1) return listed.promise
          return Promise.resolve({ rpcId: 'r', result: { ok: true as const, value: { backends: backendRoster() } } })
        },
      },
      settings: {
        update: () => { calls.update++; return saved.promise },
      },
    } as unknown as IApiClient
    const controller = new AgentBackendSettingsController(api, settingsFace())
    const first = controller.load()
    const second = controller.load()
    listed.resolve({ rpcId: 'r', result: { ok: true, value: { backends: backendRoster() } } } as never)
    await Promise.all([first, second])
    expect(calls.list).toBe(1)

    await controller.select(id('dsh'))
    expect(calls.update).toBe(0)
    const saving = controller.select(id('pi'))
    await controller.select(id('dsh'))
    expect(calls.update).toBe(1)
    saved.resolve({ rpcId: 'r', result: { ok: true, value: {} } } as never)
    await saving
  })

  it('restores the old default when the settings transport rejects a non-Error', async () => {
    const controller = new AgentBackendSettingsController({
      agentBackends: {
        list: () => Promise.resolve({ rpcId: 'r', result: { ok: true as const, value: { backends: backendRoster() } } }),
      },
      // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- messageOf must defend against arbitrary thenables.
      settings: { update: () => Promise.reject('offline') },
    } as unknown as IApiClient, settingsFace())
    await controller.load()

    await controller.select(id('pi'))

    expect(controller.store.getSnapshot()).toMatchObject({ current: 'dsh', error: 'offline' })
  })
})

describe('AgentBackendSeatController', () => {
  it('switches a live blank Session and publishes the confirmed backend', async () => {
    const calls: unknown[] = []
    const applied: unknown[] = []
    const session = { id: 'session-1' as SessionId, blank: true, agentBackend: id('dsh') }
    const api = {
      agentBackends: {
        list: () => Promise.resolve({ rpcId: 'r', result: { ok: true as const, value: { backends: backendRoster() } } }),
        select: (payload: unknown) => {
          calls.push(payload)
          return Promise.resolve({ rpcId: 'r', result: { ok: true as const, value: { agentBackend: id('pi') } } })
        },
      },
    } as unknown as Pick<IApiClient, 'agentBackends'>
    const controller = new AgentBackendSeatController(api, () => session, (sessionId, backend) => {
      applied.push({ sessionId, backend })
    })
    await controller.load()

    await controller.select(id('pi'))

    expect(calls).toEqual([{ sessionId: 'session-1', agentBackend: 'pi' }])
    expect(applied).toEqual([{ sessionId: 'session-1', backend: 'pi' }])
    expect(controller.store.getSnapshot()).toMatchObject({ current: 'pi', busy: false, error: null })
  })

  it('stages a choice until a blank Session exists', async () => {
    const session: { current?: { id: SessionId; blank: boolean; agentBackend?: AgentBackendId } } = {}
    const calls: unknown[] = []
    const api = {
      agentBackends: {
        list: () => Promise.resolve({ rpcId: 'r', result: { ok: true as const, value: { backends: backendRoster() } } }),
        select: (payload: unknown) => {
          calls.push(payload)
          return Promise.resolve({ rpcId: 'r', result: { ok: true as const, value: { agentBackend: id('pi') } } })
        },
      },
    } as unknown as Pick<IApiClient, 'agentBackends'>
    const controller = new AgentBackendSeatController(api, () => session.current)
    await controller.load()

    await controller.select(id('pi'))
    expect(calls).toEqual([])
    session.current = { id: 'session-2' as SessionId, blank: true, agentBackend: id('dsh') }
    await controller.apply()

    expect(calls).toEqual([{ sessionId: 'session-2', agentBackend: 'pi' }])
  })

  it('restores the Session backend when the host locks selection', async () => {
    const session = { id: 'session-1' as SessionId, blank: true, agentBackend: id('dsh') }
    const api = {
      agentBackends: {
        list: () => Promise.resolve({ rpcId: 'r', result: { ok: true as const, value: { backends: backendRoster() } } }),
        select: () => Promise.resolve({
          rpcId: 'r',
          result: { ok: false as const, error: { code: 'agent-backend-locked', message: 'already started', details: {} } },
        }),
      },
    } as unknown as Pick<IApiClient, 'agentBackends'>
    const controller = new AgentBackendSeatController(api, () => session)
    await controller.load()

    await controller.select(id('pi'))

    expect(controller.store.getSnapshot()).toMatchObject({ current: 'dsh', busy: false, error: 'already started' })
  })

  it('reports roster failures and uses the first row when no default is marked', async () => {
    const rejected = new AgentBackendSeatController({
      agentBackends: {
        list: () => Promise.resolve({
          rpcId: 'r',
          result: { ok: false as const, error: { code: 'internal', message: 'host down', details: {} } },
        }),
      },
    } as unknown as Pick<IApiClient, 'agentBackends'>, () => undefined)
    await rejected.load()
    expect(rejected.store.getSnapshot().error).toBe('host down')

    const disconnected = new AgentBackendSeatController({
      // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- messageOf must defend against arbitrary thenables.
      agentBackends: { list: () => Promise.reject('offline') },
    } as unknown as Pick<IApiClient, 'agentBackends'>, () => undefined)
    await disconnected.load()
    expect(disconnected.store.getSnapshot().error).toBe('offline')

    const fallback = new AgentBackendSeatController({
      agentBackends: {
        list: () => Promise.resolve({
          rpcId: 'r',
          result: {
            ok: true as const,
            value: { backends: backendRoster().map(backend => ({ ...backend, isDefault: false })) },
          },
        }),
      },
    } as unknown as Pick<IApiClient, 'agentBackends'>, () => undefined)
    await fallback.load()
    expect(fallback.store.getSnapshot().current).toBe('dsh')
  })

  it('drops a staged choice for a started or already-matching Session', async () => {
    const calls: unknown[] = []
    const session = { current: { id: 'started' as SessionId, blank: false, agentBackend: id('dsh') } }
    const api = {
      agentBackends: {
        list: () => Promise.resolve({ rpcId: 'r', result: { ok: true as const, value: { backends: backendRoster() } } }),
        select: (payload: unknown) => { calls.push(payload); return Promise.resolve({}) },
      },
    } as unknown as Pick<IApiClient, 'agentBackends'>
    const controller = new AgentBackendSeatController(api, () => session.current)
    await controller.load()
    await controller.select(id('pi'))
    session.current = { id: 'started' as SessionId, blank: true, agentBackend: id('dsh') }
    await controller.apply()
    expect(calls).toEqual([])

    session.current = { id: 'same' as SessionId, blank: true, agentBackend: id('pi') }
    await controller.select(id('pi'))
    expect(calls).toEqual([])
  })

  it('ignores another pick while switching and reports a rejected transport', async () => {
    const selected = Promise.withResolvers<never>()
    const session = { id: 'session-1' as SessionId, blank: true }
    const api = {
      agentBackends: {
        list: () => Promise.resolve({ rpcId: 'r', result: { ok: true as const, value: { backends: backendRoster() } } }),
        select: () => selected.promise,
      },
    } as unknown as Pick<IApiClient, 'agentBackends'>
    const controller = new AgentBackendSeatController(api, () => session)
    await controller.load()
    const saving = controller.select(id('pi'))
    await controller.select(id('dsh'))
    selected.reject(new Error('socket closed'))
    await saving
    expect(controller.store.getSnapshot()).toMatchObject({ current: 'dsh', busy: false, error: 'socket closed' })
  })

  it('uses the roster fallback after a business rejection when the Session has no backend', async () => {
    const session = { id: 'session-1' as SessionId, blank: true }
    const controller = new AgentBackendSeatController({
      agentBackends: {
        list: () => Promise.resolve({ rpcId: 'r', result: { ok: true as const, value: { backends: backendRoster() } } }),
        select: () => Promise.resolve({
          rpcId: 'r',
          result: { ok: false as const, error: { code: 'agent-backend-locked', message: 'locked', details: {} } },
        }),
      },
    } as unknown as Pick<IApiClient, 'agentBackends'>, () => session)
    await controller.load()

    await controller.select(id('pi'))

    expect(controller.store.getSnapshot()).toMatchObject({ current: 'dsh', error: 'locked' })
  })
})
