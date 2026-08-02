export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-center font-mono text-sm">
        <h1 className="text-4xl font-bold mb-8 text-center">
          MCP Games - CYOA Engine
        </h1>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
          <h2 className="text-2xl font-semibold mb-4">
            Welcome to Choose Your Own Adventure
          </h2>
          <p className="mb-4 text-gray-700 dark:text-gray-300">
            Experience personalized narratives powered by semantic MCP querying.
            Connect your GitHub, Linear, Notion, and other data sources to create
            stories that adapt to your real context.
          </p>
          <div className="space-y-4 mt-6">
            <div className="border-l-4 border-blue-500 pl-4">
              <h3 className="font-semibold">🔌 MCP Integration</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Connect to your favorite productivity tools
              </p>
            </div>
            <div className="border-l-4 border-green-500 pl-4">
              <h3 className="font-semibold">🤖 AI-Powered Narratives</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Dynamic stories generated from your real data
              </p>
            </div>
            <div className="border-l-4 border-purple-500 pl-4">
              <h3 className="font-semibold">🎯 Personalized Choices</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Every decision reflects your actual context
              </p>
            </div>
          </div>
          <div className="mt-8 flex gap-4">
            <a href="/game" className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg">
              Start Adventure
            </a>
            <a href="https://github.com/RemyLoveLogicAI/mcp-games-monorepo" target="_blank" rel="noopener" className="bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-6 rounded-lg">
              View Repo
            </a>
          </div>
        </div>
      </div>
    </main>
  )
}
