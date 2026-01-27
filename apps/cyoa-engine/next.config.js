/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['shared-types', 'mcp-sdk', 'story-engine'],
  env: {
    MCP_CONNECTOR_URL: process.env.MCP_CONNECTOR_URL || 'http://localhost:3001',
    NARRATIVE_AI_URL: process.env.NARRATIVE_AI_URL || 'http://localhost:8000',
  },
}

module.exports = nextConfig
