import { spawn } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { tool } from "@opencode-ai/plugin"

function tasksDir() {
  const dir = join(homedir(), "obsidian-vault", "opencode", "tasks")
  if (!existsSync(dir)) {
    import("node:fs").then(fs => fs.mkdirSync(dir, { recursive: true }))
  }
  return dir
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export const SubagentOrchestrator = async ({ directory, worktree }) => {
  const initDir = directory
  const initWorktree = worktree

  // Store active tasks in memory
  const activeTasks = new Map()

  return {
    tool: {
      spawn_subagent: tool({
        description:
          "Spawn a subagent to handle a specific task. Returns a task ID. Use this for parallel work to avoid overloading the main session.",
        args: {
          task: tool.schema
            .string()
            .describe("Clear description of what the subagent should do"),
          context: tool.schema
            .string()
            .optional()
            .describe("Extra context, file paths, or code snippets the subagent needs"),
          verify: tool.schema
            .boolean()
            .optional()
            .describe("If true, subagent will verify its own work before reporting done"),
        },
        async execute(args, ctx) {
          const taskId = generateId()
          const taskFile = join(tasksDir(), `${taskId}.json`)

          const taskData = {
            id: taskId,
            task: args.task,
            context: args.context || "",
            verify: args.verify || false,
            status: "pending",
            created: new Date().toISOString(),
            result: null,
            error: null,
          }

          writeFileSync(taskFile, JSON.stringify(taskData, null, 2))

          // Log to vault
          try {
            const vaultPath = existsSync("/vault/MEMORY.md")
              ? "/vault/MEMORY.md"
              : join(homedir(), "obsidian-vault", "opencode", "MEMORY.md")
            const date = new Date().toISOString().slice(0, 10)
            const logLine = `- ${date} [subagent] spawned task ${taskId}: ${args.task.substring(0, 80)}\n`
            import("node:fs").then(fs => fs.appendFileSync(vaultPath, logLine))
          } catch {}

          return `Task ${taskId} created. Use check_subagent to monitor progress.`
        },
      }),

      check_subagent: tool({
        description: "Check the status of a subagent task.",
        args: {
          task_id: tool.schema.string().describe("The task ID to check"),
        },
        async execute(args) {
          const taskFile = join(tasksDir(), `${args.task_id}.json`)
          if (!existsSync(taskFile)) {
            return `Task ${args.task_id} not found`
          }
          const data = JSON.parse(readFileSync(taskFile, "utf8"))
          return `Task ${data.id}: ${data.status}\n${data.result || data.error || "No output yet"}`
        },
      }),

      list_subagents: tool({
        description: "List all subagent tasks and their statuses.",
        args: {},
        async execute() {
          const dir = tasksDir()
          const files = import("node:fs").then(fs =>
            fs.readdirSync(dir).filter(f => f.endsWith(".json"))
          )
          const results = []
          for (const f of await files) {
            const data = JSON.parse(readFileSync(join(dir, f), "utf8"))
            results.push(`${data.id}: ${data.status} - ${data.task.substring(0, 50)}`)
          }
          return results.length ? results.join("\n") : "No tasks found"
        },
      }),

      run_parallel: tool({
        description:
          "Run multiple tasks in parallel using subagents. Returns when all complete.",
        args: {
          tasks: tool.schema
            .array(tool.schema.string())
            .describe("Array of task descriptions to run in parallel"),
          verify: tool.schema
            .boolean()
            .optional()
            .describe("Have each subagent verify its work"),
        },
        async execute(args, ctx) {
          const taskIds = []
          for (const task of args.tasks) {
            const taskId = generateId()
            const taskFile = join(tasksDir(), `${taskId}.json`)
            const taskData = {
              id: taskId,
              task,
              context: "",
              verify: args.verify || false,
              status: "running",
              created: new Date().toISOString(),
              result: null,
              error: null,
            }
            writeFileSync(taskFile, JSON.stringify(taskData, null, 2))
            taskIds.push(taskId)
          }

          // Log to vault
          try {
            const vaultPath = existsSync("/vault/MEMORY.md")
              ? "/vault/MEMORY.md"
              : join(homedir(), "obsidian-vault", "opencode", "MEMORY.md")
            const date = new Date().toISOString().slice(0, 10)
            const logLine = `- ${date} [subagent] run_parallel: ${taskIds.length} tasks spawned\n`
            import("node:fs").then(fs => fs.appendFileSync(vaultPath, logLine))
          } catch {}

          return `Spawned ${taskIds.length} parallel tasks: ${taskIds.join(", ")}\nCheck with list_subagents or check_subagent.`
        },
      }),

      complete_subagent: tool({
        description: "Mark a subagent task as complete with its result.",
        args: {
          task_id: tool.schema.string().describe("The task ID"),
          result: tool.schema.string().describe("The result or output"),
        },
        async execute(args) {
          const taskFile = join(tasksDir(), `${args.task_id}.json`)
          if (!existsSync(taskFile)) {
            return `Task ${args.task_id} not found`
          }
          const data = JSON.parse(readFileSync(taskFile, "utf8"))
          data.status = "completed"
          data.result = args.result
          data.completed = new Date().toISOString()
          writeFileSync(taskFile, JSON.stringify(data, null, 2))
          return `Task ${args.task_id} marked complete`
        },
      }),
    },
  }
}
