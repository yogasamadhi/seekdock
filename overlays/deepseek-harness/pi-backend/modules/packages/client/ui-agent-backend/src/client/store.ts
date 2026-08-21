import type { AgentBackendId, IApiClient } from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore, type SessionId, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SettingsDescribeFace } from '@deepseek-ai/dsh-client-ui-settings/client'

/** Host settings namespace that owns the new-Session backend default. */
export const AGENT_BACKEND_SETTINGS_NS = 'agent-loop'

/** One backend row displayed by every selector. */
export interface AgentBackendOption {
  id: AgentBackendId
  name: string
  description?: string
  isDefault: boolean
}

/** Snapshot for the deployment-default backend settings row. */
export interface AgentBackendSettingsState {
  status: 'idle' | 'loading' | 'ready' | 'saving' | 'unavailable' | 'error'
  error: string | null
  writable: boolean
  current: AgentBackendId | undefined
  options: readonly AgentBackendOption[]
}

const SETTINGS_INITIAL: AgentBackendSettingsState = {
  status: 'idle', error: null, writable: true, current: undefined, options: [],
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Read and persist the deployment-wide default Agent backend. */
export class AgentBackendSettingsController {
  /** Observable controller state. */
  readonly store: SnapshotStore<AgentBackendSettingsState> = createSnapshotStore(SETTINGS_INITIAL)

  constructor(
    private readonly api: IApiClient,
    private readonly describeFace: SettingsDescribeFace,
  ) {}

  private set(patch: Partial<AgentBackendSettingsState>): void {
    this.store.set({ ...this.store.getSnapshot(), ...patch })
  }

  /** Load the backend roster and current deployment default. */
  async load(): Promise<void> {
    if (this.store.getSnapshot().status === 'loading') return
    this.set({ status: 'loading', error: null })
    try {
      const response = await this.api.agentBackends.list({})
      if (!response.result.ok) {
        this.set({ status: 'error', error: response.result.error.message })
        return
      }
      const options = [...response.result.value.backends]
      if (options.length === 0) {
        this.set({ status: 'unavailable', options: [], current: undefined })
        return
      }
      await this.describeFace.ensure()
      this.set({
        status: 'ready',
        error: null,
        writable: this.describeFace.getSnapshot().view?.writable ?? false,
        options,
        current: options.find(option => option.isDefault)?.id ?? options[0]?.id,
      })
    } catch (error) {
      this.set({ status: 'error', error: messageOf(error) })
    }
  }

  /**
   * Persist the backend used by later Sessions.
   * @param id - registered backend id to make the default.
   */
  async select(id: AgentBackendId): Promise<void> {
    const before = this.store.getSnapshot()
    if (before.status === 'saving' || before.current === id) return
    this.set({ status: 'saving', current: id, error: null })
    try {
      const response = await this.api.settings.update({
        ns: AGENT_BACKEND_SETTINGS_NS,
        patch: { defaultBackend: id },
      })
      if (!response.result.ok) {
        this.set({ status: 'ready', current: before.current, error: response.result.error.message })
        return
      }
      await this.load()
    } catch (error) {
      this.set({ status: 'ready', current: before.current, error: messageOf(error) })
    }
  }
}

/** Snapshot for the blank-Session backend seat. */
export interface AgentBackendSeatState {
  options: readonly AgentBackendOption[]
  current: AgentBackendId | undefined
  error: string | null
  busy: boolean
}

const SEAT_INITIAL: AgentBackendSeatState = { options: [], current: undefined, error: null, busy: false }

/** Current blank Session consumed by the hero-stage controller. */
export interface BackendSeatSession {
  id: SessionId
  blank: boolean
  agentBackend?: AgentBackendId
}

/** Stage a backend choice and apply it to the blank Session entering the flow. */
export class AgentBackendSeatController {
  /** Observable controller state. */
  readonly store: SnapshotStore<AgentBackendSeatState> = createSnapshotStore(SEAT_INITIAL)
  private fallback: AgentBackendId | undefined
  private staged: AgentBackendId | undefined

  constructor(
    private readonly api: Pick<IApiClient, 'agentBackends'>,
    private readonly currentSession: () => BackendSeatSession | undefined,
    private readonly onApplied?: (sessionId: SessionId, backend: AgentBackendId) => void,
  ) {}

  private set(patch: Partial<AgentBackendSeatState>): void {
    this.store.set({ ...this.store.getSnapshot(), ...patch })
  }

  /** Load the backend roster and resolve the seat's displayed selection. */
  async load(): Promise<void> {
    try {
      const response = await this.api.agentBackends.list({})
      if (!response.result.ok) {
        this.set({ error: response.result.error.message })
        return
      }
      const options = [...response.result.value.backends]
      this.fallback = options.find(option => option.isDefault)?.id ?? options[0]?.id
      this.set({
        options,
        current: this.staged ?? this.currentSession()?.agentBackend ?? this.fallback,
        error: null,
      })
    } catch (error) {
      this.set({ error: messageOf(error) })
    }
  }

  /**
   * Stage a choice and apply it when a blank Session is available.
   * @param id - registered backend id selected for the next blank Session.
   */
  async select(id: AgentBackendId): Promise<void> {
    if (this.store.getSnapshot().busy) return
    this.staged = id
    this.set({ current: id, error: null })
    await this.apply()
  }

  /** Apply the staged choice to the current blank Session, if one exists. */
  async apply(): Promise<void> {
    const staged = this.staged
    const session = this.currentSession()
    if (staged === undefined || session === undefined) return
    if (!session.blank || session.agentBackend === staged) {
      this.staged = undefined
      return
    }
    this.set({ busy: true, error: null })
    try {
      const response = await this.api.agentBackends.select({
        sessionId: session.id,
        agentBackend: staged,
      })
      this.staged = undefined
      if (!response.result.ok) {
        this.set({ busy: false, current: session.agentBackend ?? this.fallback, error: response.result.error.message })
        return
      }
      this.set({ busy: false, current: response.result.value.agentBackend })
      this.onApplied?.(session.id, response.result.value.agentBackend)
    } catch (error) {
      this.staged = undefined
      this.set({ busy: false, current: session.agentBackend ?? this.fallback, error: messageOf(error) })
    }
  }
}
