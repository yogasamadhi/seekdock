/** Locale copy for Agent-backend settings, hero, and header surfaces. */

export type AgentBackendLocaleKey =
  | 'title' | 'description' | 'loading' | 'error' | 'seatHint' | 'headerHint' | 'noDescription'

/** English copy for Agent-backend surfaces. */
export const en: Record<AgentBackendLocaleKey, string> = {
  title: 'Agent engine',
  description: 'Choose the loop engine for new sessions. A session keeps its engine after its first turn starts.',
  loading: 'Loading engines…',
  error: 'Could not load agent engines.',
  seatHint: 'Agent engine for the session you are about to start',
  headerHint: 'The agent engine driving this session',
  noDescription: 'No description.',
}

/** Simplified Chinese copy for Agent-backend surfaces. */
export const zh: Record<AgentBackendLocaleKey, string> = {
  title: 'Agent 引擎',
  description: '选择新会话使用的循环引擎。首轮开始后，会话将保持当前引擎。',
  loading: '正在加载引擎…',
  error: '无法加载 Agent 引擎。',
  seatHint: '即将开始的会话所使用的 Agent 引擎',
  headerHint: '驱动本会话的 Agent 引擎',
  noDescription: '暂无描述。',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Agent-backend surface copy. */
    'settings.agentBackend': AgentBackendLocaleKey
  }
}
