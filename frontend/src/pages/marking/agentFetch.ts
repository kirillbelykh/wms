export type AgentTargetAddressSpace = 'loopback' | 'private'

export interface AgentRequestInit extends RequestInit {
  targetAddressSpace?: AgentTargetAddressSpace
}

export function getAgentTargetAddressSpace(agentUrl: string): AgentTargetAddressSpace {
  try {
    const hostname = new URL(agentUrl).hostname.toLowerCase()
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return 'loopback'
    }
  } catch {
    return 'loopback'
  }

  return 'private'
}

export function withAgentFetchOptions(agentUrl: string, init: AgentRequestInit = {}): AgentRequestInit {
  return {
    mode: 'cors',
    cache: 'no-store',
    ...init,
    targetAddressSpace: getAgentTargetAddressSpace(agentUrl),
  }
}
