import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { tool } from "@opencode-ai/plugin"

const COORD_DIR = join(homedir(), "obsidian-vault", "coordination")
const SESSIONS_FILE = join(COORD_DIR, "sessions.json")
const MESSAGES_DIR = join(COORD_DIR, "messages")
const STATUS_DIR = join(COORD_DIR, "status")

function ensureDirs() {
  for (const dir of [COORD_DIR, MESSAGES_DIR, STATUS_DIR]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  }
}

function readSessions() {
  if (!existsSync(SESSIONS_FILE)) return {}
  try { return JSON.parse(readFileSync(SESSIONS_FILE, "utf8")) } catch { return {} }
}

function writeSessions(data) {
  ensureDirs()
  writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2))
}

function sessionId() {
  return process.env.OPENCODE_SESSION_ID || "session-" + Date.now().toString(36)
}

export const SessionSync = async () => {
  ensureDirs()

  return {
    tool: {
      session_register: tool({
        description: "Register this session so others can see it. Call once at start.",
        args: {
          name: tool.schema.string().describe("A human-readable name for this session, e.g. 'api-dev', 'frontend', 'scout'"),
        },
        async execute(args) {
          const id = sessionId()
          const sessions = readSessions()
          sessions[id] = {
            name: args.name,
            id,
            registered: new Date().toISOString(),
            last_seen: new Date().toISOString(),
            status: "online",
            working_on: "",
          }
          writeSessions(sessions)

          // Write status file
          writeFileSync(join(STATUS_DIR, `${id}.json`), JSON.stringify(sessions[id], null, 2))

          return `Registered as "${args.name}" (id: ${id}). Other sessions can now see you.`
        },
      }),

      session_status: tool({
        description: "Update what this session is currently working on.",
        args: {
          status: tool.schema.string().describe("What you're doing, e.g. 'building auth module', 'reviewing PR #42', 'idle'"),
        },
        async execute(args) {
          const id = sessionId()
          const sessions = readSessions()
          if (!sessions[id]) {
            sessions[id] = { name: id, id, registered: new Date().toISOString(), last_seen: new Date().toISOString(), status: "online", working_on: "" }
          }
          sessions[id].working_on = args.status
          sessions[id].last_seen = new Date().toISOString()
          writeSessions(sessions)
          writeFileSync(join(STATUS_DIR, `${id}.json`), JSON.stringify(sessions[id], null, 2))

          return `Status updated: "${args.status}"`
        },
      }),

      session_list: tool({
        description: "List all registered sessions and what they're doing.",
        args: {},
        async execute() {
          const sessions = readSessions()
          const now = Date.now()
          const lines = []
          for (const [id, s] of Object.entries(sessions)) {
            const lastSeen = new Date(s.last_seen).getTime()
            const minsAgo = Math.floor((now - lastSeen) / 60000)
            const stale = minsAgo > 5 ? " (stale)" : ""
            const working = s.working_on ? ` — ${s.working_on}` : ""
            lines.push(`• ${s.name} (${id}): ${s.status}${stale}${working} [${minsAgo}m ago]`)
          }
          return lines.length ? lines.join("\n") : "No sessions registered. Others need to call session_register first."
        },
      }),

      session_write: tool({
        description: "Send a message to another session. They'll see it when they call session_read.",
        args: {
          to: tool.schema.string().describe("Name of the session to message"),
          message: tool.schema.string().describe("The message content"),
        },
        async execute(args) {
          const id = sessionId()
          const sessions = readSessions()
          const senderName = sessions[id]?.name || id

          const msgFile = join(MESSAGES_DIR, `${Date.now()}-${id}.json`)
          writeFileSync(msgFile, JSON.stringify({
            from: senderName,
            from_id: id,
            to: args.to,
            message: args.message,
            time: new Date().toISOString(),
            read: false,
          }, null, 2))

          return `Message sent to "${args.to}".`
        },
      }),

      session_read: tool({
        description: "Read messages sent to this session.",
        args: {
          name: tool.schema.string().describe("Your session name (the name you registered with)"),
        },
        async execute(args) {
          const files = readdirSync(MESSAGES_DIR).filter(f => f.endsWith(".json"))
          const myMessages = []

          for (const f of files) {
            try {
              const msg = JSON.parse(readFileSync(join(MESSAGES_DIR, f), "utf8"))
              if (msg.to === args.name && !msg.read) {
                myMessages.push({ ...msg, _file: f })
              }
            } catch {}
          }

          if (!myMessages.length) return "No new messages."

          const lines = myMessages.map(m => `[${m.time}] From ${m.from}: ${m.message}`)
          // Mark as read
          for (const m of myMessages) {
            const path = join(MESSAGES_DIR, m._file)
            const data = JSON.parse(readFileSync(path, "utf8"))
            data.read = true
            writeFileSync(path, JSON.stringify(data, null, 2))
          }

          return `${myMessages.length} message(s):\n${lines.join("\n")}`
        },
      }),

      session_broadcast: tool({
        description: "Send a message to all registered sessions.",
        args: {
          message: tool.schema.string().describe("The message to broadcast"),
        },
        async execute(args) {
          const id = sessionId()
          const sessions = readSessions()
          const senderName = sessions[id]?.name || id
          let count = 0

          for (const [sid, s] of Object.entries(sessions)) {
            if (sid === id) continue
            const msgFile = join(MESSAGES_DIR, `${Date.now()}-${sid}.json`)
            writeFileSync(msgFile, JSON.stringify({
              from: senderName,
              from_id: id,
              to: s.name,
              message: args.message,
              time: new Date().toISOString(),
              read: false,
              broadcast: true,
            }, null, 2))
            count++
          }

          return `Broadcast sent to ${count} session(s).`
        },
      }),

      session_unregister: tool({
        description: "Unregister this session (call when shutting down).",
        args: {},
        async execute() {
          const id = sessionId()
          const sessions = readSessions()
          delete sessions[id]
          writeSessions(sessions)

          const statusFile = join(STATUS_DIR, `${id}.json`)
          if (existsSync(statusFile)) unlinkSync(statusFile)

          return `Session "${id}" unregistered.`
        },
      }),
    },
  }
}
