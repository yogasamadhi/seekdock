import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import type { AgentBackendStepContext } from '@deepseek-ai/dsh-agent-loop'
import * as PiBackend from '@seekdock/dsh-agent-backend-pi'
import LlmRuntime, { CallId, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { AssistantMessage, StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import { describe, expect, it, vi } from 'vitest'
import {
  MockAdapter,
  maxTokensResponse,
  textResponse,
  toolCallResponse,
} from '../../agent-loop/tests/mock-adapter.ts'

async function boot(adapter: MockAdapter): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt, { persona: '' })
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(PiBackend)
  ctx.llm.registerAdapter(['mock'], adapter)
  return ctx
}

function run(agent: Agent, text = 'go'): Promise<void> {
  agent.followup(createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  }))
  return agent.whenIdle()
}

function directContext(options: {
  chunks?: StreamChunk[]
  buildError?: Error
  concluded?: boolean
}) {
  const appended: AssistantMessage[] = []
  const chunks = options.chunks ?? textResponse('direct')
  const context = {
    agent: { options: {} },
    assembly: { tools: [] },
    signal: new AbortController().signal,
    ctx: {
      llm: {
        async * stream() {
          for (const chunk of chunks) yield chunk
        },
      },
    },
    buildRequest: () => {
      if (options.buildError !== undefined) return Promise.reject(options.buildError)
      return Promise.resolve({ request: { provider: 'mock', model: 'mock', messages: [], tools: [] } })
    },
    appendChunk: () => 0,
    appendAssistant: (message: AssistantMessage) => { appended.push(message) },
    requestError: () => Promise.resolve(undefined),
    executeToolCalls: () => Promise.resolve({ concluded: options.concluded ?? false }),
  } as unknown as AgentBackendStepContext
  return { context, appended }
}

describe('Pi Agent backend', () => {
  it('drives a text step through the DSH LLM and session log', async () => {
    const adapter = new MockAdapter([textResponse('from pi')])
    const ctx = await boot(adapter)
    const agent = ctx.agentLoop.create(
      SessionId('pi-text'),
      { provider: 'mock', model: 'mock' },
      {},
      PiBackend.PI_AGENT_BACKEND_ID,
    )

    await run(agent)

    expect(agent.backend).toBe(PiBackend.PI_AGENT_BACKEND_ID)
    expect(agent.session.deriveMessages().at(-1)).toMatchObject({
      role: 'assistant',
      content: [{ type: 'text', text: 'from pi' }],
    })
    expect(adapter.requests).toHaveLength(1)
    await ctx.fiber.dispose()
  })

  it('hands Pi tool calls to the DSH tool pipeline before the next step', async () => {
    const adapter = new MockAdapter([
      toolCallResponse('call-1', 'echo', { value: 'one' }),
      textResponse('done'),
    ])
    const ctx = await boot(adapter)
    const execute = vi.fn((args: { value: string }) => Promise.resolve([
      { type: 'text' as const, text: `echo:${args.value}` },
    ]))
    ctx.tools.register(defineContentToolFixture({
      name: 'echo',
      description: 'echo one value',
      parameters: { value: { type: 'string', required: true } },
      execute,
    }))
    const agent = ctx.agentLoop.create(
      SessionId('pi-tool'),
      { provider: 'mock', model: 'mock' },
      {},
      PiBackend.PI_AGENT_BACKEND_ID,
    )

    await run(agent)

    expect(execute).toHaveBeenCalledWith({ value: 'one' }, expect.anything())
    expect(agent.session.events.filter(event => event.type === 'tool/call')).toHaveLength(1)
    expect(agent.session.events.filter(event => event.type === 'tool/result')).toHaveLength(1)
    expect(adapter.requests).toHaveLength(2)
    await ctx.fiber.dispose()
  })

  it('ends immediately when a DSH tool concludes the turn', async () => {
    const adapter = new MockAdapter([toolCallResponse('call-final', 'finish', {})])
    const ctx = await boot(adapter)
    ctx.tools.register(defineContentToolFixture({
      name: 'finish',
      description: 'finish this turn',
      parameters: {},
      async execute(_args, exec) {
        exec.concludeTurn()
        return [{ type: 'text', text: 'finished' }]
      },
    }))
    const agent = ctx.agentLoop.create(
      SessionId('pi-conclude'),
      { provider: 'mock', model: 'mock' },
      {},
      PiBackend.PI_AGENT_BACKEND_ID,
    )

    await run(agent)

    expect(adapter.requests).toHaveLength(1)
    expect(agent.session.events.some(event => event.type === 'tool/result')).toBe(true)
    await ctx.fiber.dispose()
  })

  it('maps reasoning, detailed usage, replay state, and malformed tool arguments', async () => {
    const replayState = { response: { id: 'r1' }, blocks: ['reasoning'] }
    const malformedTools: StreamChunk[] = [
      { type: 'block-end', index: 0, block: { type: 'tool-call', id: CallId('bad'), name: 'echo', arguments: 'not-json' } },
      { type: 'block-end', index: 1, block: { type: 'tool-call', id: CallId('array'), name: 'echo', arguments: '[]' } },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ]
    const adapter = new MockAdapter([
      [
        { type: 'block-start', index: 0, blockType: 'reasoning' },
        { type: 'reasoning-delta', index: 0, text: 'think' },
        { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'think' } },
        {
          type: 'usage',
          usage: {
            inputTokens: 4, outputTokens: 2, reasoningTokens: 1,
            cacheReadTokens: 3, cacheWriteTokens: 5,
          },
        },
        { type: 'finish', reason: { kind: 'stop' }, replayState },
      ],
      malformedTools,
      textResponse('after invalid tools'),
    ])
    const ctx = await boot(adapter)
    ctx.tools.register(defineContentToolFixture({
      name: 'echo', description: '', parameters: {}, execute: () => Promise.resolve([]),
    }))
    const reasoning = ctx.agentLoop.create(
      SessionId('pi-reasoning'), { provider: 'mock', model: 'mock' }, {}, PiBackend.PI_AGENT_BACKEND_ID,
    )
    await run(reasoning)
    expect(reasoning.session.deriveMessages().at(-1)).toMatchObject({
      content: [{ type: 'reasoning', text: 'think' }],
      source: { replayState },
    })
    expect(reasoning.session.events.findLast(event => event.type === 'assistant/message')).toMatchObject({
      data: { usage: { reasoningTokens: 1, cacheReadTokens: 3, cacheWriteTokens: 5 } },
    })

    const malformed = ctx.agentLoop.create(
      SessionId('pi-malformed-tools'), { provider: 'mock', model: 'mock' }, {}, PiBackend.PI_AGENT_BACKEND_ID,
    )
    await run(malformed)
    expect(adapter.requests).toHaveLength(3)
    await ctx.fiber.dispose()
  })

  it('routes failed attempts through DSH recovery and retries', async () => {
    const adapter = new MockAdapter([
      [{ type: 'finish', reason: { kind: 'error', failure: { message: 'retry me', code: 'TEMP' } } }],
      textResponse('recovered'),
    ])
    const ctx = await boot(adapter)
    const failures: string[] = []
    ctx.on('agent/request-error', async ({ failure }) => {
      failures.push(failure.code)
      return { kind: 'retry' }
    })
    const agent = ctx.agentLoop.create(
      SessionId('pi-retry'),
      { provider: 'mock', model: 'mock' },
      {},
      PiBackend.PI_AGENT_BACKEND_ID,
    )

    await run(agent)

    expect(failures).toEqual(['TEMP'])
    expect(adapter.requests).toHaveLength(2)
    expect(agent.session.deriveMessages().at(-1)?.content).toEqual([{ type: 'text', text: 'recovered' }])
    await ctx.fiber.dispose()
  })

  it('preserves max-token turn completion', async () => {
    const ctx = await boot(new MockAdapter([maxTokensResponse('partial')]))
    const agent = ctx.agentLoop.create(
      SessionId('pi-max'),
      { provider: 'mock', model: 'mock' },
      {},
      PiBackend.PI_AGENT_BACKEND_ID,
    )

    await run(agent)

    expect(agent.session.events.findLast(event => event.type === 'turn/end')).toMatchObject({
      data: { reason: { kind: 'max-tokens' } },
    })
    await ctx.fiber.dispose()
  })

  it('cancels through the DSH turn signal and retains the visible prefix', async () => {
    const ctx = await boot(new MockAdapter(['hang']))
    const agent = ctx.agentLoop.create(
      SessionId('pi-cancel'),
      { provider: 'mock', model: 'mock' },
      {},
      PiBackend.PI_AGENT_BACKEND_ID,
    )

    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'stop' }], source: { kind: 'user' } }))
    await vi.waitFor(() => {
      expect(agent.session.events.some(event => event.type === 'assistant/chunk')).toBe(true)
    })
    agent.cancel({ kind: 'user' })
    await agent.whenIdle()

    expect(agent.session.events.findLast(event => event.type === 'assistant/message')).toMatchObject({
      data: { interrupted: true },
    })
    expect(agent.session.events.findLast(event => event.type === 'turn/end')).toMatchObject({
      data: { reason: { kind: 'aborted', reason: { kind: 'user' } } },
    })
    await ctx.fiber.dispose()
  })

  it('cancels an empty stream without inventing an interrupted assistant message', async () => {
    const adapter = new MockAdapter([{ hangAfter: [] }])
    const ctx = await boot(adapter)
    const agent = ctx.agentLoop.create(
      SessionId('pi-cancel-empty'),
      { provider: 'mock', model: 'mock' },
      {},
      PiBackend.PI_AGENT_BACKEND_ID,
    )

    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'stop' }], source: { kind: 'user' } }))
    await vi.waitFor(() => { expect(adapter.requests).toHaveLength(1) })
    agent.cancel({ kind: 'user' })
    await agent.whenIdle()

    expect(agent.session.events.some(event => event.type === 'assistant/message')).toBe(false)
    await ctx.fiber.dispose()
  })

  it('uses the context LLM fallback and surfaces an unrecovered build failure', async () => {
    const success = directContext({})
    await expect(PiBackend.piAgentBackend.runStep(success.context)).resolves.toEqual({ kind: 'completed' })
    expect(success.appended).toHaveLength(1)

    const failed = directContext({ buildError: new Error('build failed') })
    await expect(PiBackend.piAgentBackend.runStep(failed.context)).rejects.toMatchObject({
      message: 'build failed', code: 'UNKNOWN',
    })
  })
})
