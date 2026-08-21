/** Pi's low-level reaction loop adapted to the DSH Agent backend seam. */

import { runAgentLoop } from '@earendil-works/pi-agent-core'
import type { AgentContext, AgentTool, StreamFn } from '@earendil-works/pi-agent-core'
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai'
import type { AssistantMessage as PiAssistantMessage, Model, StopReason, Usage } from '@earendil-works/pi-ai'
import type { Context } from '@deepseek-ai/cordis'
import type { AgentBackendDriver, AgentBackendStepContext, AgentBackendStepEnd } from '@deepseek-ai/dsh-agent-loop'
import {
  BlockAssembler,
  LlmError,
  createAssistantMessage,
  errorChain,
} from '@deepseek-ai/dsh-llm'
import type {
  AssistantMessage,
  ContentBlock,
  FinishReason,
  LlmFailure,
  TokenUsage,
  ToolSchema,
} from '@deepseek-ai/dsh-llm'
import { AgentBackendId } from '@deepseek-ai/dsh-session'

/** Stable id of the Pi Agent backend. */
export const PI_AGENT_BACKEND_ID = AgentBackendId('pi')

const PI_MODEL: Model<string> = {
  id: 'dsh',
  name: 'DSH',
  api: 'dsh',
  provider: 'dsh',
  baseUrl: '',
  reasoning: true,
  input: ['text', 'image'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: Number.MAX_SAFE_INTEGER,
  maxTokens: Number.MAX_SAFE_INTEGER,
}

function usageFromDsh(usage: TokenUsage | undefined): Usage {
  const input = usage?.inputTokens ?? 0
  const output = usage?.outputTokens ?? 0
  const cacheRead = usage?.cacheReadTokens ?? 0
  const cacheWrite = usage?.cacheWriteTokens ?? 0
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    ...usage?.reasoningTokens === undefined ? {} : { reasoning: usage.reasoningTokens },
    totalTokens: input + output + cacheRead + cacheWrite,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  }
}

function toolArguments(raw: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(raw)
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {}
  } catch (_invalidJson) {
    return {}
  }
}

function contentFromDsh(blocks: readonly ContentBlock[]): PiAssistantMessage['content'] {
  return blocks.flatMap((block): PiAssistantMessage['content'] => {
    switch (block.type) {
      case 'text': return [{ type: 'text', text: block.text }]
      case 'reasoning': return [{ type: 'thinking', thinking: block.text }]
      case 'tool-call': return [{
        type: 'toolCall',
        id: block.id,
        name: block.name,
        arguments: toolArguments(block.arguments),
      }]
      /* v8 ignore next -- ContentBlock is closed; this protects future runtime drift. */
      default: return []
    }
  })
}

function piMessage(
  provider: string,
  model: string,
  content: PiAssistantMessage['content'],
  stopReason: StopReason,
  usage?: TokenUsage,
  errorMessage?: string,
): PiAssistantMessage {
  return {
    role: 'assistant',
    api: 'dsh',
    provider,
    model,
    content,
    usage: usageFromDsh(usage),
    stopReason,
    ...errorMessage === undefined ? {} : { errorMessage },
    timestamp: Date.now(),
  }
}

function piTools(tools: readonly ToolSchema[]): AgentTool[] {
  return tools.map(tool => ({
    name: tool.name,
    label: tool.name,
    description: tool.description,
    parameters: tool.parameters as never,
    // Pi owns orchestration only. DSH validates and executes the complete batch
    // after Pi closes this turn, so this result never enters DSH history.
    execute: () => Promise.resolve({
      content: [{ type: 'text' as const, text: 'Execution is delegated to DeepSeek Harness.' }],
      details: undefined,
      terminate: true,
    }),
  }))
}

async function runPiStep(context: AgentBackendStepContext): Promise<AgentBackendStepEnd> {
  while (true) {
    let message: AssistantMessage | undefined
    let finish: FinishReason | undefined
    let failure: LlmFailure | undefined
    let provider = context.agent.options.provider ?? ''
    let model = context.agent.options.model ?? ''
    let retryPolicy: Parameters<AgentBackendStepContext['requestError']>[2]

    const streamFn: StreamFn = async () => {
      const output = createAssistantMessageEventStream()
      const assembler = new BlockAssembler()
      const chunkSeqs: number[] = []
      try {
        const built = await context.buildRequest()
        provider = built.request.provider
        model = built.request.model
        retryPolicy = built.preparedCall?.retryPolicy
        const stream = built.preparedCall?.stream(built.request) ?? context.ctx.llm.stream(built.request)
        context.signal.throwIfAborted()
        for await (const chunk of stream) {
          context.signal.throwIfAborted()
          chunkSeqs.push(context.appendChunk(chunk))
          assembler.push(chunk)
        }
        context.signal.throwIfAborted()
        finish = assembler.finish
        if (finish.kind === 'error' || finish.kind === 'aborted') {
          failure = finish.failure
          const failed = piMessage(provider, model, [], finish.kind, assembler.usage, finish.failure.message)
          output.push({ type: 'error', reason: finish.kind, error: failed })
          return output
        }
        message = createAssistantMessage({
          content: assembler.blocks(),
          source: {
            provider,
            model,
            ...assembler.replayState === undefined ? {} : { replayState: assembler.replayState },
          },
        })
        context.appendAssistant(message, chunkSeqs, assembler.usage)
        const stopReason: 'length' | 'toolUse' | 'stop' = finish.kind === 'max-tokens'
          ? 'length'
          : message.content.some(block => block.type === 'tool-call') ? 'toolUse' : 'stop'
        const completed = piMessage(provider, model, contentFromDsh(message.content), stopReason, assembler.usage)
        output.push({ type: 'start', partial: completed })
        output.push({ type: 'done', reason: stopReason, message: completed })
      } catch (error: unknown) {
        if (context.signal.aborted) {
          const content = assembler.interruptedBlocks()
          if (content.length > 0) {
            context.appendAssistant(createAssistantMessage({
              content,
              source: { provider, model },
            }), chunkSeqs, assembler.usage, true)
          }
        }
        failure = { message: errorChain(error), code: context.signal.aborted ? 'ABORTED' : 'UNKNOWN' }
        const failed = piMessage(
          provider,
          model,
          [],
          context.signal.aborted ? 'aborted' : 'error',
          assembler.usage,
          failure.message,
        )
        output.push({ type: 'error', reason: failed.stopReason as 'aborted' | 'error', error: failed })
      }
      return output
    }

    const piContext: AgentContext = {
      systemPrompt: '',
      messages: [],
      tools: piTools(context.assembly.tools),
    }
    await runAgentLoop([], piContext, {
      model: PI_MODEL,
      convertToLlm: () => [],
      shouldStopAfterTurn: () => true,
      toolExecution: 'parallel',
    }, () => undefined, context.signal, streamFn)
    context.signal.throwIfAborted()

    if (failure !== undefined) {
      const action = await context.requestError(provider, failure, retryPolicy)
      context.signal.throwIfAborted()
      if (action?.kind === 'retry') continue
      throw new LlmError(failure.message, failure.code, failure)
    }
    /* v8 ignore next -- runAgentLoop settles only after streamFn emits done or error. */
    if (message === undefined || finish === undefined) throw new Error('Pi backend completed without an assistant message')
    if (finish.kind === 'max-tokens') return { kind: 'max-tokens' }
    if (!message.content.some(block => block.type === 'tool-call')) return { kind: 'completed' }
    const { concluded } = await context.executeToolCalls(message)
    return concluded ? { kind: 'completed' } : null
  }
}

/** Pi backend contribution registered by this plugin. */
export const piAgentBackend: AgentBackendDriver = {
  id: PI_AGENT_BACKEND_ID,
  name: 'Pi',
  description: 'Pi reaction-loop orchestration with DSH tools, approvals, and persistence.',
  runStep: runPiStep,
}

export const name = 'agent-backend-pi'
export const inject = ['agentLoop']

/** Register the Pi backend for the lifetime of this plugin fiber. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.agentLoop.registerBackend(piAgentBackend), 'agentBackendPi.register()')
}
