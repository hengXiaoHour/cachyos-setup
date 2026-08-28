import { appendFileSync, existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { tool } from "@opencode-ai/plugin"

function vaultPath() {
  if (existsSync("/vault/MEMORY.md")) return "/vault/MEMORY.md"
  return join(homedir(), "obsidian-vault", "opencode", "MEMORY.md")
}

function agentsPaths() {
  if (existsSync("/config/AGENTS.md")) return ["/vault/MEMORY.md", "/config/AGENTS.md"]
  return [
    join(homedir(), "obsidian-vault", "opencode", "MEMORY.md"),
    join(homedir(), ".config", "opencode", "AGENTS.md"),
  ]
}

export const VaultMemory = async ({ directory, worktree }) => {
  const initDir = directory
  const initWorktree = worktree

  function tag(ctx) {
    const dir = ctx?.directory || initDir || process.cwd()
    const wt = ctx?.worktree || initWorktree || ""
    const sid = ctx?.sessionID || ctx?.sessionId || ""
    const who = "opencode"
    const parts = [`[${who}]`]
    if (sid) parts.push(`[session:${sid}]`)
    if (dir) parts.push(`[dir:${dir}]`)
    if (wt && wt !== dir) parts.push(`[worktree:${wt}]`)
    return parts.join(" ")
  }

  return {
    "experimental.chat.system.transform": async (input, output) => {
      try {
        const p = vaultPath()
        let vault = ""
        try {
          vault = readFileSync(p, "utf8")
        } catch {}
        if (vault.trim().length === 0) return
        const snippet = vault.slice(-8000)
        output.system = (output.system || "") + `\n\n## Memory vault (auto-loaded from ${p} — last 8k)\n${snippet}\n`
      } catch {}
    },
    "experimental.session.compacting": async (input, output) => {
      output.context.push(
        `## Shared memory vault\n` +
          `Before compaction, persist anything the next session must not lose: ` +
          `call memory_write for unresolved errors, lessons from mistakes, and key decisions.`
      )
    },
    event: async ({ event }) => {
      try {
        if (event.type === "session.idle" || event.type === "session.created") {
          const p = vaultPath()
          const sid = event.properties?.sessionID || event.properties?.sessionId || ""
          const ctx = { directory: initDir, worktree: initWorktree, sessionID: sid }
          const date = new Date().toISOString().slice(0, 10)
          const line = `- ${date} ${tag(ctx)} auto: ${event.type}\n`
          appendFileSync(p, line)
          try {
            const [, apath] = agentsPaths()
            appendFileSync(apath, line)
          } catch {}
        }
      } catch {}
    },
    "tool.execute.after": async (input, output) => {
      try {
        if (input.tool === "edit" || input.tool === "write") {
          const ok = output?.output?.success !== false
          if (!ok) return
          const p = vaultPath()
          const ctx = { directory: output?.directory || initDir, worktree: output?.worktree || initWorktree, sessionID: input?.sessionID || output?.sessionID }
          const date = new Date().toISOString().slice(0, 10)
          const detail = `${input.tool}: ${input.args?.filePath || ""}`
          const line = `- ${date} ${tag(ctx)} auto: ${detail}\n`
          appendFileSync(p, line)
          try {
            const [, apath] = agentsPaths()
            appendFileSync(apath, line)
          } catch {}
        }
      } catch {}
    },
    tool: {
      memory_write: tool({
        description:
          "Append a durable fact to the memory vault. Use this AUTOMATICALLY — without being asked — whenever you learn, decide, or configure something worth remembering across sessions: installed tools, paths, credentials locations (never secrets), user preferences, project decisions.",
        args: {
          entry: tool.schema
            .string()
            .describe("One-line fact. Terse. Never include secrets or API keys."),
          heading: tool.schema
            .string()
            .optional()
            .describe("Optional section heading to file the entry under, e.g. 'OpenCode notes'"),
        },
        async execute(args, ctx) {
          const p = vaultPath()
          let content = ""
          try {
            content = readFileSync(p, "utf8")
          } catch {}
          let addition = ""
          if (args.heading && !content.includes(`## ${args.heading}`)) {
            addition += `\n## ${args.heading}\n`
          }
          const date = new Date().toISOString().slice(0, 10)
          const line = `- ${date} ${tag(ctx)} ${args.entry}\n`
          if (addition) appendFileSync(p, addition)
          appendFileSync(p, line)
          let mirrored = ""
          try {
            const [, apath] = agentsPaths()
            if (addition) appendFileSync(apath, addition)
            appendFileSync(apath, line)
            mirrored = ` (+ mirrored to AGENTS.md)`
          } catch {}
          return `Saved to vault (${p})${mirrored}: ${line.trim()}`
        },
      }),
    },
  }
}
