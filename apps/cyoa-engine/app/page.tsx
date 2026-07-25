import { permanentRedirect } from 'next/navigation'

const flagshipUrl =
  process.env.MCP_GAMES_FLAGSHIP_URL ??
  'https://mcp-games-command-center.lovelogic-ai.chatgpt.site'

export default function Home() {
  permanentRedirect(flagshipUrl)
}
