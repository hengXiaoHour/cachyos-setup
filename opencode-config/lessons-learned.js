import { appendFileSync, existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

function vaultPath() {
  if (existsSync("/vault/MEMORY.md")) return "/vault/MEMORY.md"
  return join(homedir(), "obsidian-vault", "opencode", "MEMORY.md")
}

function lessonsPath() {
  return join(homedir(), "obsidian-vault", "opencode", "LESSONS.md")
}

function ensureLessonsFile() {
  const p = lessonsPath()
  if (!existsSync(p)) {
    appendFileSync(p, `# OpenCode Lessons Learned\n\nAuto-tracked mistakes and fixes.\n\n---\n\n`)
  }
}

export const LessonsLearned = async ({ directory, worktree }) => {
  const initDir = directory
  const initWorktree = worktree

  function tag(ctx) {
    const dir = ctx?.directory || initDir || process.cwd()
    const wt = ctx?.worktree || initWorktree || ""
    const sid = ctx?.sessionID || ctx?.sessionId || ""
    const parts = []
    if (sid) parts.push(`[session:${sid}]`)
    if (dir) parts.push(`[dir:${dir}]`)
    if (wt && wt !== dir) parts.push(`[worktree:${wt}]`)
    return parts.join(" ")
  }

  function logLesson(type, detail, ctx) {
    ensureLessonsFile()
    const p = lessonsPath()
    const date = new Date().toISOString().slice(0, 10)
    const time = new Date().toISOString().slice(11, 19)
    const tagStr = tag(ctx)
    const line = `- ${date} ${time} ${tagStr} [${type}] ${detail}\n`
    appendFileSync(p, line)
  }

  return {
    // Before bash executes, check if command looks like a past mistake
    "tool.execute.before": async (input, ctx) => {
      if (input.tool !== "bash") return

      const cmd = input.args?.command || ""
      if (!cmd) return

      // Check lessons file for similar failed commands
      try {
        const lessons = readFileSync(lessonsPath(), "utf8")
        const lines = lessons.split("\n")
        const recent = lines.slice(-100) // Check last 100 lines

        // Simple pattern matching for common mistakes
        const mistakePatterns = [
          { pattern: /sudo dpkg/, fix: "Use pacman/pamac instead (Arch-based)" },
          { pattern: /apt(-get)? (install|remove)/, fix: "Use pacman instead (Arch-based)" },
          { pattern: /make(?!install)/, fix: "Check if meson/ninja needed" },
          { pattern: /sudo pacman -S(?!.*--noconfirm)/, fix: "Add --noconfirm flag" },
          { pattern: /cd .+&&/, fix: "Use workdir parameter instead" },
        ]

        for (const { pattern, fix } of mistakePatterns) {
          if (pattern.test(cmd)) {
            // Check if we've failed this before
            const recentFails = recent.filter(l =>
              l.includes("[FAILED]") && l.includes(fix)
            )
            if (recentFails.length > 0) {
              return {
                warning: `⚠️ Past mistake detected: ${fix}\nThis failed ${recentFails.length} time(s) before.`
              }
            }
          }
        }
      } catch {}
    },

    // After bash executes, log failures and successes
    "tool.execute.after": async (input, output, ctx) => {
      if (input.tool !== "bash") return

      const cmd = input.args?.command || ""
      const success = output?.output?.success !== false
      const error = output?.output?.error || ""

      if (!success && error) {
        // Log failure
        logLesson("FAILED", `Command: ${cmd.substring(0, 100)}`, ctx)
        logLesson("ERROR", error.substring(0, 200), ctx)
      }
    },

    // After edit/write, log the fix if it was correcting something
    "tool.execute.after": async (input, output, ctx) => {
      if (input.tool !== "edit" && input.tool !== "write") return

      const success = output?.output?.success !== false
      const filePath = input.args?.filePath || ""

      if (success && filePath) {
        // Track what was fixed
        const content = input.args?.content || ""
        if (content.includes("fix") || content.includes("Fix") || content.includes("FIX")) {
          logLesson("FIXED", `File: ${filePath}`, ctx)
        }
      }
    },

    // Provide tool for manual lesson logging
    tool: {
      log_lesson: {
        description: "Log a lesson learned from a mistake. Use after fixing something.",
        args: {
          what_failed: { type: "string", description: "What went wrong" },
          why: { type: "string", description: "Why it failed" },
          fix: { type: "string", description: "What worked instead" },
        },
        async execute(args, ctx) {
          ensureLessonsFile()
          const p = lessonsPath()
          const date = new Date().toISOString().slice(0, 10)
          const time = new Date().toISOString().slice(11, 19)
          const tagStr = tag(ctx)
          const entry = `\n### ${date} ${time}\n- **Failed:** ${args.what_failed}\n- **Reason:** ${args.why}\n- **Fix:** ${args.fix}\n`
          appendFileSync(p, entry)

          // Also add one-liner to MEMORY.md
          const mp = vaultPath()
          const memLine = `- ${date} ${tagStr} lesson: ${args.what_failed} -> ${args.fix}\n`
          appendFileSync(mp, memLine)

          return `Lesson logged to:\n- ${p}\n- ${mp}`
        },
      },
    },
  }
}
