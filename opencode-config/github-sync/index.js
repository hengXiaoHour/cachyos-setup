import { appendFileSync, existsSync, readFileSync } from "node:fs"
import { execSync } from "node:child_process"
import { homedir } from "node:os"
import { join } from "node:path"

function vaultPath() {
  return existsSync("/vault/MEMORY.md")
    ? "/vault/MEMORY.md"
    : join(homedir(), "obsidian-vault", "opencode", "MEMORY.md")
}

function isGitRepo(dir) {
  try {
    execSync("git rev-parse --is-inside-work-tree", { cwd: dir, stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

function gitHasChanges(dir) {
  try {
    const out = execSync("git status --porcelain", { cwd: dir }).toString().trim()
    return out.length > 0
  } catch {
    return false
  }
}

function gitCommitAndPush(dir, message) {
  try {
    execSync("git add .", { cwd: dir, stdio: "ignore" })
    execSync(`git commit -m "${message}"`, { cwd: dir, stdio: "ignore" })
    execSync("git push", { cwd: dir, stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

export const GithubSync = async ({ directory, worktree }) => {
  const initDir = directory
  const initWorktree = worktree
  let pendingChanges = new Map()
  let syncTimer = null

  function scheduleSync(dir) {
    if (syncTimer) clearTimeout(syncTimer)
    syncTimer = setTimeout(() => {
      flushSync(dir)
    }, 5000) // 5s debounce
  }

  function flushSync(dir) {
    if (!isGitRepo(dir)) return
    if (!gitHasChanges(dir)) return

    const date = new Date().toISOString().slice(0, 10)
    const time = new Date().toISOString().slice(11, 19)
    const msg = `auto-sync: ${date} ${time}`
    const ok = gitCommitAndPush(dir, msg)

    if (ok) {
      try {
        appendFileSync(vaultPath(), `- ${date} [github] auto-synced\n`)
      } catch {}
    }
  }

  return {
    "tool.execute.after": async (input, output, ctx) => {
      const dir = ctx?.directory || initDir || process.cwd()

      // Skip git commands themselves to avoid loops
      if (input.tool === "bash") {
        const cmd = input.args?.command || ""
        if (cmd.includes("git ") || cmd.includes("gh ")) return
      }

      const success = output?.output?.success !== false
      if (!success) return

      // Track file-modifying tools
      const fileTools = ["write", "edit", "bash"]
      if (!fileTools.includes(input.tool)) return

      scheduleSync(dir)
    },

    tool: {
      sync_github: {
        description: "Force sync to GitHub now (auto-sync runs after successful tasks)",
        args: {
          message: {
            type: "string",
            description: "Commit message (optional)",
          },
        },
        async execute(args, ctx) {
          const dir = ctx?.directory || initDir || process.cwd()
          if (!isGitRepo(dir)) return "Not a git repo"
          if (!gitHasChanges(dir)) return "No changes to sync"

          const date = new Date().toISOString().slice(0, 10)
          const time = new Date().toISOString().slice(11, 19)
          const msg = args.message || `manual-sync: ${date} ${time}`
          const ok = gitCommitAndPush(dir, msg)

          return ok ? `Synced: ${msg}` : "Sync failed"
        },
      },

      check_sync: {
        description: "Check if there are uncommitted changes that need syncing",
        args: {},
        async execute(args, ctx) {
          const dir = ctx?.directory || initDir || process.cwd()
          if (!isGitRepo(dir)) return "Not a git repo"
          return gitHasChanges(dir) ? "Uncommitted changes exist" : "All synced"
        },
      },
    },
  }
}
