import type { Metadata } from 'next'
import GameClient from './GameClient'

export const metadata: Metadata = {
  title: 'MCP Games - Activation',
  description: 'Play a short Choose Your Own Adventure powered by the Agentic Web.',
}

export default function GamePage() {
  return <GameClient />
}
