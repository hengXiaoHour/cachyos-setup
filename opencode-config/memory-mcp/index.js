import { tool } from "@opencode-ai/plugin"
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const MCP_URL = "http://localhost:3002"

function vaultPath() {
  return join(homedir(), "obsidian-vault", "opencode", "MEMORY.md")
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

export const MemoryMCP = async () => {
  return {
    "experimental.chat.system.transform": async (input, output) => {
      try {
        const p = vaultPath()
        let vault = ""
        try { vault = readFileSync(p, "utf8") } catch {}
        if (vault.trim().length === 0) return
        const snippet = vault.slice(-8000)
        output.system = (output.system || "") + `\n\n## Memory vault (last 8k)\n${snippet}\n`
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
          return await callMCP("memory_write", args)
        },
      }),

      memory_read: tool({
        description: "Read the current memory vault",
        args: {},
        async execute() {
          return await callMCP("memory_read")
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
          return await callMCP("log_lesson", args)
        },
      }),

      lessons_read: tool({
        description: "Read the lessons learned log",
        args: {},
        async execute() {
          return await callMCP("lessons_read")
        },
      }),
    },
  }
}
