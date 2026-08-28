import { tool } from "@opencode-ai/plugin"

const MCP_URL = "http://localhost:3001"

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
