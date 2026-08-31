import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs"
import { homedir } from "node:os"
import { join, basename } from "node:path"
import { tool } from "@opencode-ai/plugin"

const COORD_ROOT = join(homedir(), "obsidian-vault", "coordination")

function projectName(directory) {
  if (!directory) return "root"
  const base = basename(directory)
  return base === "/" || base === "." || base === "" ? "root" : base
}

function sessionId() {
  return process.env.OPENCODE_SESSION_ID || "session-" + Date.now().toString(36)
}

function projectDir(directory) {
  return join(COORD_ROOT, projectName(directory))
}

function ensureDirs(directory) {
  const dirs = [
    projectDir(directory),
    join(projectDir(directory), "sessions"),
    join(projectDir(directory), "messages"),
    join(projectDir(directory), "status"),
  ]
  for (const dir of dirs) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  }
}

function sessionsFile(directory) {
  return join(projectDir(directory), "sessions.json")
}

function readSessions(directory) {
  const file = sessionsFile(directory)
  if (!existsSync(file)) return {}
  try { return JSON.parse(readFileSync(file, "utf8")) } catch { return {} }
}

function writeSessions(directory, data) {
  ensureDirs(directory)
  writeFileSync(sessionsFile(directory), JSON.stringify(data, null, 2))
}

function readProjectSessions() {
  if (!existsSync(COORD_ROOT)) return {}
  const result = {}
  for (const entry of readdirSync(COORD_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const sessionsFile_ = join(COORD_ROOT, entry.name, "sessions.json")
    if (existsSync(sessionsFile_)) {
      try {
        result[entry.name] = JSON.parse(readFileSync(sessionsFile_, "utf8"))
      } catch {}
    }
  }
  return result
}

export const SessionSync = async ({ directory }) => {
  const id = sessionId()

  // Automatic registration on load
  ensureDirs(directory)
  const sessions = readSessions(directory)
  sessions[id] = {
    name: id,
    id,
    registered: new Date().toISOString(),
    last_seen: new Date().toISOString(),
    status: "online",
    working_on: "",
  }
  writeSessions(directory, sessions)
  writeFileSync(join(projectDir(directory), "status", `${id}.json`), JSON.stringify(sessions[id], null, 2))

  return {
    tool: {
      session_status: tool({
        description: "Update what this session is currently working on.",
        args: {
          status: tool.schema.string().describe("What you're doing, e.g. 'building auth module', 'reviewing PR #42', 'idle'"),
        },
        async execute(args) {
          const sessions = readSessions(directory)
          if (!sessions[id]) {
            sessions[id] = { name: id, id, registered: new Date().toISOString(), last_seen: new Date().toISOString(), status: "online", working_on: "" }
          }
          sessions[id].working_on = args.status
          sessions[id].last_seen = new Date().toISOString()
          writeSessions(directory, sessions)
          writeFileSync(join(projectDir(directory), "status", `${id}.json`), JSON.stringify(sessions[id], null, 2))

          return `Status updated: "${args.status}"`
        },
      }),

      session_list: tool({
        description: "List all registered sessions in THIS project and what they're doing.",
        args: {},
        async execute() {
          const sessions = readSessions(directory)
          const now = Date.now()
          const lines = []
          for (const [sid, s] of Object.entries(sessions)) {
            const lastSeen = new Date(s.last_seen).getTime()
            const minsAgo = Math.floor((now - lastSeen) / 60000)
            const stale = minsAgo > 5 ? " (stale)" : ""
            const working = s.working_on ? ` — ${s.working_on}` : ""
            lines.push(`• ${s.name} (${sid}): ${s.status}${stale}${working} [${minsAgo}m ago]`)
          }
          return lines.length
            ? `Project: ${projectName(directory)}\n${lines.join("\n")}`
            : `No active sessions in project "${projectName(directory)}".`
        },
      }),

      session_all_projects: tool({
        description: "List sessions across ALL projects and what each is doing.",
        args: {},
        async execute() {
          const all = readProjectSessions()
          const now = Date.now()
          const lines = []
          for (const [proj, sessions] of Object.entries(all)) {
            for (const [sid, s] of Object.entries(sessions)) {
              const lastSeen = new Date(s.last_seen).getTime()
              const minsAgo = Math.floor((now - lastSeen) / 60000)
              const stale = minsAgo > 5 ? " (stale)" : ""
              const working = s.working_on ? ` — ${s.working_on}` : ""
              lines.push(`[${proj}] ${s.name} (${sid}): ${s.status}${stale}${working} [${minsAgo}m ago]`)
            }
          }
          return lines.length ? lines.join("\n") : "No sessions registered in any project."
        },
      }),

      session_write: tool({
        description: "Send a message to another session in THIS project. They'll see it when they call session_read.",
        args: {
          to: tool.schema.string().describe("ID or name of the session to message"),
          message: tool.schema.string().describe("The message content"),
        },
        async execute(args) {
          const sessions = readSessions(directory)
          const senderName = sessions[id]?.name || id

          // Resolve target by id or name
          let targetId = null
          for (const [sid, s] of Object.entries(sessions)) {
            if (sid === args.to || s.name === args.to) { targetId = sid; break }
          }
          if (!targetId) {
            return `Session "${args.to}" not found in this project. Use session_list to see who's here.`
          }

          const msgFile = join(projectDir(directory), "messages", `${Date.now()}-${id}.json`)
          writeFileSync(msgFile, JSON.stringify({
            from: senderName,
            from_id: id,
            to: sessions[targetId].name,
            to_id: targetId,
            message: args.message,
            time: new Date().toISOString(),
            read: false,
          }, null, 2))

          return `Message sent to "${args.to}".`
        },
      }),

      session_read: tool({
        description: "Read messages sent to THIS session by other sessions in this project.",
        args: {},
        async execute() {
          const files = readdirSync(join(projectDir(directory), "messages")).filter(f => f.endsWith(".json"))
          const myMessages = []

          for (const f of files) {
            try {
              const msg = JSON.parse(readFileSync(join(projectDir(directory), "messages", f), "utf8"))
              if (msg.to_id === id && !msg.read) {
                myMessages.push({ ...msg, _file: f })
              }
            } catch {}
          }

          if (!myMessages.length) return "No new messages."

          const lines = myMessages.map(m => `[${m.time}] From ${m.from}: ${m.message}`)
          for (const m of myMessages) {
            const path = join(projectDir(directory), "messages", m._file)
            const data = JSON.parse(readFileSync(path, "utf8"))
            data.read = true
            writeFileSync(path, JSON.stringify(data, null, 2))
          }

          return `${myMessages.length} message(s):\n${lines.join("\n")}`
        },
      }),

      session_broadcast: tool({
        description: "Send a message to all OTHER sessions in THIS project.",
        args: {
          message: tool.schema.string().describe("The message to broadcast"),
        },
        async execute(args) {
          const sessions = readSessions(directory)
          const senderName = sessions[id]?.name || id
          let count = 0

          for (const [sid, s] of Object.entries(sessions)) {
            if (sid === id) continue
            const msgFile = join(projectDir(directory), "messages", `${Date.now()}-${sid}.json`)
            writeFileSync(msgFile, JSON.stringify({
              from: senderName,
              from_id: id,
              to: s.name,
              to_id: sid,
              message: args.message,
              time: new Date().toISOString(),
              read: false,
              broadcast: true,
            }, null, 2))
            count++
          }

          return `Broadcast sent to ${count} session(s) in "${projectName(directory)}".`
        },
      }),

      session_unregister: tool({
        description: "Unregister this session from the project (call when shutting down).",
        args: {},
        async execute() {
          const sessions = readSessions(directory)
          delete sessions[id]
          writeSessions(directory, sessions)

          const statusFile = join(projectDir(directory), "status", `${id}.json`)
          if (existsSync(statusFile)) unlinkSync(statusFile)

          return `Session "${id}" unregistered from "${projectName(directory)}".`
        },
      }),
    },
  }
}
