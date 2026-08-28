import { tool } from "@opencode-ai/plugin"

const MCP_URL = "http://localhost:3002"

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

export const MemoryMCP = async () => {
  return {
    "experimental.chat.system.transform": async (input, output) => {
      try {
        const res = await callMCP("memory_read")
        const vault = res.content || ""
        if (vault.trim().length === 0) return
        output.system.push(`\n## Memory vault (last 8k)\n${vault.slice(-8000)}\n`)
      } catch {}
    },

    "experimental.session.compacting": async (input, output) => {
      output.context.push(
        `Before compaction: call memory_write for unresolved errors, lessons, and key decisions.`
      )
    },

    tool: {
      memory_write: tool({
        description: "Save a fact to the memory vault. Use automatically for important info.",
        args: {
          entry: tool.schema.string().describe("One-line fact. No secrets."),
          heading: tool.schema.string().optional().describe("Section heading"),
        },
        async execute(args) {
          const res = await callMCP("memory_write", args)
          return res.saved || JSON.stringify(res)
        },
      }),

      memory_read: tool({
        description: "Read the current memory vault",
        args: {},
        async execute() {
          const res = await callMCP("memory_read")
          return res.content || ""
        },
      }),

      log_lesson: tool({
        description: "Log a lesson learned from a mistake",
        args: {
          what_failed: tool.schema.string().describe("What went wrong"),
          why: tool.schema.string().describe("Why it failed"),
          fix: tool.schema.string().describe("What worked instead"),
        },
        async execute(args) {
          const res = await callMCP("log_lesson", args)
          return res.logged || JSON.stringify(res)
        },
      }),

      lessons_read: tool({
        description: "Read the lessons learned log",
        args: {},
        async execute() {
          const res = await callMCP("lessons_read")
          return res.content || ""
        },
      }),
    },
  }
}
