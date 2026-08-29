import { tool } from "@opencode-ai/plugin"
import { spawn } from "node:child_process"
import net from "node:net"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const MCP_URL = "http://localhost:3001"
const PORT = 3001
const __dirname = dirname(fileURLToPath(import.meta.url))

function portInUse(port) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: "127.0.0.1" })
    s.on("connect", () => { s.destroy(); resolve(true) })
    s.on("error", () => resolve(false))
  })
}

async function ensureServer() {
  if (await portInUse(PORT)) return
  const script = join(__dirname, "..", "..", "mcp-servers", "playwright-mcp", "server.js")
  const child = spawn("node", [script], {
    stdio: "ignore",
    detached: true,
    env: { ...process.env, PORT: String(PORT) },
  })
  child.unref()
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250))
    if (await portInUse(PORT)) return
  }
}

async function callMCP(method, params = {}) {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, params }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data.result
}

export const PlaywrightMCP = async () => {
  await ensureServer()

  return {
    tool: {
      playwright_screenshot: tool({
        description: "Take a screenshot of a URL using Playwright",
        args: {
          url: tool.schema.string().describe("URL to screenshot"),
          path: tool.schema.string().optional().describe("Save path"),
        },
        async execute(args) {
          const res = await callMCP("screenshot", args)
          return res.saved || JSON.stringify(res)
        },
      }),

      playwright_scrape: tool({
        description: "Scrape text content from a URL",
        args: {
          url: tool.schema.string().describe("URL to scrape"),
          selector: tool.schema.string().optional().describe("CSS selector"),
        },
        async execute(args) {
          const res = await callMCP("scrape", args)
          return res.text || JSON.stringify(res)
        },
      }),

      playwright_snapshot: tool({
        description: "Get page elements for diagnosing test failures",
        args: {
          url: tool.schema.string().describe("URL to snapshot"),
        },
        async execute(args) {
          const res = await callMCP("snapshot", args)
          return JSON.stringify(res.elements || res, null, 2)
        },
      }),

      playwright_eval: tool({
        description: "Run arbitrary Playwright code",
        args: {
          code: tool.schema.string().describe("JavaScript code"),
        },
        async execute(args) {
          const res = await callMCP("eval", args)
          return res.output || JSON.stringify(res)
        },
      }),

      playwright_test: tool({
        description: "Run Playwright tests",
        args: {
          testPath: tool.schema.string().describe("Path to test file(s)"),
        },
        async execute(args) {
          const res = await callMCP("test_run", args)
          return res.output || JSON.stringify(res)
        },
      }),

      playwright_test_fix: tool({
        description: "Run tests, auto-fix failures, re-run (vision loop)",
        args: {
          testPath: tool.schema.string().describe("Path to test file(s)"),
          maxIterations: tool.schema.number().optional().describe("Max iterations (default 3)"),
        },
        async execute(args) {
          const res = await callMCP("test_fix", args)
          return JSON.stringify(res, null, 2)
        },
      }),
    },
  }
}
