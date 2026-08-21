// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { AgentBackendLabel, type AgentBackendLabelProps } from '../src/client/AgentBackendLabel.tsx'
import { AgentBackendRow, type AgentBackendRowProps } from '../src/client/AgentBackendRow.tsx'
import { AgentBackendSeat, type AgentBackendSeatProps } from '../src/client/AgentBackendSeat.tsx'
import { en } from '../src/client/locales.ts'
import type { AgentBackendSeatState, AgentBackendSettingsState } from '../src/client/store.ts'

afterEach(cleanup)

const OPTIONS = [
  { id: 'dsh' as never, name: 'DeepSeek Harness', description: 'Built-in loop', isDefault: true },
  { id: 'pi' as never, name: 'Pi', isDefault: false },
]

const SETTINGS_READY: AgentBackendSettingsState = {
  status: 'ready', error: null, writable: true, current: 'dsh' as never, options: OPTIONS,
}

const SEAT_READY: AgentBackendSeatState = {
  current: 'dsh' as never, options: OPTIONS, error: null, busy: false,
}

const t = (key: keyof typeof en): string => en[key]

function renderRow(state: Partial<AgentBackendSettingsState> = {}) {
  const store = createSnapshotStore<AgentBackendSettingsState>({ ...SETTINGS_READY, ...state })
  const actions = { load: vi.fn(() => Promise.resolve()), select: vi.fn(() => Promise.resolve()) }
  const view = render(<AgentBackendRow {...({
    ...actions,
    useAgentBackend: bindSnapshotSelector(store),
    t,
  } as unknown as AgentBackendRowProps)} />)
  return { ...actions, view }
}

function renderSeat(state: Partial<AgentBackendSeatState> = {}) {
  const store = createSnapshotStore<AgentBackendSeatState>({ ...SEAT_READY, ...state })
  const actions = { load: vi.fn(() => Promise.resolve()), select: vi.fn(() => Promise.resolve()) }
  const view = render(<AgentBackendSeat {...({
    ...actions,
    useAgentBackendSeat: bindSnapshotSelector(store),
    t,
  } as unknown as AgentBackendSeatProps)} />)
  return { ...actions, view }
}

function renderLabel(backend: string | undefined, options = OPTIONS) {
  const sessions = createSnapshotStore({
    byId: backend === undefined ? {} : { s1: { agentBackend: backend } },
  })
  const roster = createSnapshotStore<AgentBackendSettingsState>({ ...SETTINGS_READY, options })
  const load = vi.fn(() => Promise.resolve())
  const view = render(<AgentBackendLabel {...({
    sessionId: 's1',
    useSessions: bindSnapshotSelector(sessions),
    useAgentBackends: bindSnapshotSelector(roster),
    load,
    t,
  } as unknown as AgentBackendLabelProps)} />)
  return { load, view }
}

describe('Agent-backend surfaces', () => {
  it('loads, opens, selects, and dismisses the General setting menu', async () => {
    const actions = renderRow()
    await waitFor(() => { expect(actions.load).toHaveBeenCalledOnce() })
    const button = screen.getByRole('button')
    expect(button.textContent).toContain('DeepSeek Harness')

    fireEvent.click(button)
    fireEvent.click(screen.getByText('Pi'))
    expect(actions.select).toHaveBeenCalledWith('pi')
    expect(button.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(button)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
  })

  it('renders the General row states without promising an unavailable write', () => {
    expect(renderRow({ status: 'unavailable' }).view.container.firstChild).toBeNull()
    cleanup()

    renderRow({ status: 'loading', current: undefined, options: [] })
    expect(screen.getByRole('button').textContent).toContain(en.loading)
    expect(screen.getByRole('button')).toHaveProperty('disabled', true)
    cleanup()

    renderRow({ status: 'saving', writable: false, error: 'read only' })
    expect(screen.getByRole('alert').textContent).toBe('read only')
    expect(screen.getByRole('button')).toHaveProperty('disabled', true)
  })

  it('shows backend descriptions and applies a blank-Session choice', async () => {
    const actions = renderSeat()
    await waitFor(() => { expect(actions.load).toHaveBeenCalledOnce() })
    const button = screen.getByRole('button')
    expect(button.getAttribute('title')).toBe(en.seatHint)
    fireEvent.click(button)
    expect(screen.getByText('Built-in loop')).toBeTruthy()
    expect(screen.getByText(en.noDescription)).toBeTruthy()
    fireEvent.click(screen.getByText('Pi'))
    expect(actions.select).toHaveBeenCalledWith('pi')

    fireEvent.click(button)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
  })

  it('hides an unresolved seat and disables or explains an in-flight one', () => {
    expect(renderSeat({ current: 'missing' as never }).view.container.firstChild).toBeNull()
    cleanup()

    renderSeat({ busy: true, error: 'already started' })
    expect(screen.getByRole('button')).toHaveProperty('disabled', true)
    expect(screen.getByRole('button').getAttribute('title')).toBe('already started')
  })

  it('labels a known backend and loads its roster metadata', async () => {
    const { load } = renderLabel('dsh')
    await waitFor(() => { expect(load).toHaveBeenCalledOnce() })
    expect(screen.getByText('DeepSeek Harness').getAttribute('title')).toBe('Built-in loop')
  })

  it('falls back to a durable id and hides a Session without one', () => {
    expect(renderLabel(undefined).view.container.firstChild).toBeNull()
    cleanup()

    renderLabel('contributed', [])
    expect(screen.getByText('contributed').getAttribute('title')).toBe(en.headerHint)
  })
})
