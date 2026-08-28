import { createServer } from "node:http"
import { appendFileSync, readFileSync, existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const PORT = process.env.PORT || 3002

function vaultPath() {
  return existsSync("/vault/MEMORY.md")
    ? "/vault/MEMORY.md"
    : join(homedir(), "obsidian-vault", "opencode", "MEMORY.md")
}

function lessonsPath() {
  return join(homedir(), "obsidian-vault", "opencode", "LESSONS.md")
}

function agentsPath() {
  return join(homedir(), ".config", "opencode", "AGENTS.md")
}

function timestamp() {
  const d = new Date()
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 19) }
}

function logBoth(line) {
  try {
    appendFileSync(vaultPath(), line)
    appendFileSync(agentsPath(), line)
  } catch {}
}

const handlers = {
  memory_write: async ({ entry, heading }) => {
    const p = vaultPath()
    let content = ""
    try { content = readFileSync(p, "utf8") } catch {}

    if (heading && !content.includes(`## ${heading}`)) {
      appendFileSync(p, `\n## ${heading}\n`)
    }

    const { date, time } = timestamp()
    const line = `- ${date} ${time} ${entry}\n`
    appendFileSync(p, line)
    logBoth(line)
    return { saved: line.trim() }
  },

  memory_read: async ({}) => {
    try {
      return { content: readFileSync(vaultPath(), "utf8") }
    } catch {
      return { content: "" }
    }
  },

  log_lesson: async ({ what_failed, why, fix }) => {
    const p = lessonsPath()
    if (!existsSync(p)) {
      appendFileSync(p, `# OpenCode Lessons Learned\n\n---\n\n`)
    }

    const { date, time } = timestamp()
    const entry = `\n### ${date} ${time}\n- **Failed:** ${what_failed}\n- **Reason:** ${why}\n- **Fix:** ${fix}\n`
    appendFileSync(p, entry)

    const memLine = `- ${date} lesson: ${what_failed} -> ${fix}\n`
    logBoth(memLine)

    return { logged: entry.trim() }
  },

  lessons_read: async ({}) => {
    try {
      return { content: readFileSync(lessonsPath(), "utf8") }
    } catch {
      return { content: "" }
    }
  },
}

const server = createServer(async (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ tools: Object.keys(handlers) }))
    return
  }

  let body = ""
  for await (const chunk of req) body += chunk

  try {
    const { method, params } = JSON.parse(body)
    if (!handlers[method]) {
      res.writeHead(400, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ error: `Unknown method: ${method}` }))
      return
    }
    const result = await handlers[method](params || {})
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ result }))
  } catch (e) {
    res.writeHead(500, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ error: e.message }))
  }
})

server.listen(PORT, () => console.log(`Memory MCP on :${PORT}`))
