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

function logToVault(line) {
  try {
    const p = vaultPath()
    appendFileSync(p, line)
    const [, apath] = agentsPaths()
    appendFileSync(apath, line)
  } catch {}
}

export const VaultMemory = async ({ directory, worktree }) => {
  const initDir = directory
  const initWorktree = worktree
  const sessionMessages = new Map()

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

    "experimental.chat.messages.transform": async (input, output) => {
      try {
        const messages = output?.messages || []
        if (messages.length === 0) return

        const lastMsg = messages[messages.length - 1]
        const parts = lastMsg?.parts || []
        const userText = parts
          .filter(p => p.type === "text")
          .map(p => p.text)
          .join(" ")
          .slice(0, 200)

        if (!userText) return

        const sid = messages[0]?.info?.sessionID || ""
        const ctx = { directory: initDir, worktree: initWorktree, sessionID: sid }
        const date = new Date().toISOString().slice(0, 10)
        const time = new Date().toISOString().slice(11, 19)

        if (!sessionMessages.has(sid)) {
          sessionMessages.set(sid, { userMsgs: [], assistantMsgs: [] })
        }
        const session = sessionMessages.get(sid)

        if (lastMsg?.info?.role === "user") {
          session.userMsgs.push(userText)
          if (session.userMsgs.length <= 3) {
            logToVault(`- ${date} ${time} ${tag(ctx)} user: ${userText}\n`)
          }
        }
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
          const time = new Date().toISOString().slice(11, 19)
          const line = `- ${date} ${time} ${tag(ctx)} auto: ${event.type}\n`
          appendFileSync(p, line)
          try {
            const [, apath] = agentsPaths()
            appendFileSync(apath, line)
          } catch {}

          if (event.type === "session.idle" && sessionMessages.has(sid)) {
            const session = sessionMessages.get(sid)
            const summary = session.userMsgs.slice(-3).join("; ").slice(0, 300)
            if (summary) {
              const summaryLine = `- ${date} ${time} ${tag(ctx)} session_summary: ${summary}\n`
              appendFileSync(p, summaryLine)
              try {
                const [, apath] = agentsPaths()
                appendFileSync(apath, summaryLine)
              } catch {}
            }
            sessionMessages.delete(sid)
          }
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
          const time = new Date().toISOString().slice(11, 19)
          const detail = `${input.tool}: ${input.args?.filePath || ""}`
          const line = `- ${date} ${time} ${tag(ctx)} auto: ${detail}\n`
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
          const time = new Date().toISOString().slice(11, 19)
          const line = `- ${date} ${time} ${tag(ctx)} ${args.entry}\n`
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
