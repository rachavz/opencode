import { planTaskPrompt, type ParsedTask } from "./plan-tasks"
import type { DirectorySDK } from "@/context/sdk"

export type RunnerTaskStatus = "pending" | "running" | "done" | "failed"

export type RunnerTaskState = {
  status: RunnerTaskStatus
  attempts: number
  messageID?: string
}

export type RunnerPlanState = {
  sessionID?: string
  running: boolean
  tasks: Record<string, RunnerTaskState>
  uiTasks: { id: string; text: string }[]
}

export const MAX_TASK_ATTEMPTS = 3

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

function taskKey(source: "file" | "ui", id: string) {
  return `${source}:${id}`
}

function messageIDFor(key: string, attempt: number) {
  return `plan-${key.replace(/[^a-zA-Z0-9_-]/g, "_")}-a${attempt}`
}

export type PlanRunnerInput = {
  directory: () => string
  // Scoped SDK context for the project directory.
  sdk: () => DirectorySDK
  // Reactive status of a session on this server: "idle" | "busy" | "retry" | undefined.
  sessionStatus: (sessionID: string) => string | undefined
  state: () => RunnerPlanState
  update: (fn: (draft: RunnerPlanState) => void) => void
  onError: (kind: "session" | "prompt") => void
}

// Sequential task executor: admits one task at a time into a single dedicated
// session, waits for the session to settle, then continues with the next task.
// Failed attempts are re-queued after the remaining tasks (max MAX_TASK_ATTEMPTS),
// so one bad task never blocks the pipeline.
export function createPlanRunner(input: PlanRunnerInput) {
  const fullList = (fileTasks: ParsedTask[]) => {
    const state = input.state()
    return [
      ...fileTasks.map((task) => ({ key: taskKey("file", String(task.line)), text: task.text })),
      ...state.uiTasks.map((task) => ({ key: taskKey("ui", task.id), text: task.text })),
    ]
  }

  // Drop state for removed tasks and un-stick tasks left "running" by a crash.
  const syncTasks = (fileTasks: ParsedTask[]) => {
    const keys = new Set(fullList(fileTasks).map((task) => task.key))
    input.update((draft) => {
      for (const key of keys) {
        if (!draft.tasks[key]) draft.tasks[key] = { status: "pending", attempts: 0 }
        if (draft.tasks[key].status === "running") draft.tasks[key].status = "pending"
      }
      for (const key of Object.keys(draft.tasks)) {
        if (!keys.has(key)) delete draft.tasks[key]
      }
    })
  }

  const setStatus = (key: string, status: RunnerTaskStatus) => {
    input.update((draft) => {
      const state = draft.tasks[key] ?? (draft.tasks[key] = { status: "pending", attempts: 0 })
      state.status = status
    })
  }

  // Order-agnostic: finds the assistant response created soonest AFTER the
  // given user message, using timestamps when present.
  const findAssistantAfter = async (sessionID: string, messageID: string) => {
    const response = await input.sdk().client.session.messages({ sessionID, limit: 50 })
    const items = (Array.isArray(response.data) ? response.data : []).filter((item) => !!item?.info?.id)
    const user = items.find((item) => item.info.id === messageID)
    if (!user) return undefined
    const created = (info: { time?: { created?: number } }) => info.time?.created
    const userTime = created(user.info)
    const assistants = items.filter((item) => item.info.role === "assistant")
    if (userTime === undefined) return assistants.at(-1)?.info
    return assistants
      .filter((item) => {
        const time = created(item.info)
        return time !== undefined && time >= userTime
      })
      .sort((a, b) => created(a.info)! - created(b.info)!)
      .at(0)?.info
  }

  // Resolves when the session settles with an assistant response to messageID.
  const waitForCompletion = async (sessionID: string, messageID: string) => {
    let sawBusy = false
    for (let elapsed = 0; elapsed < 60 * 60 * 24 * 30; elapsed++) {
      await sleep(1000)
      const status = input.sessionStatus(sessionID)
      if (status === "busy" || status === "retry") sawBusy = true
      if (!sawBusy && elapsed > 90) return "failed" as const

      if (status === "busy" || status === "retry") continue
      const assistant = await findAssistantAfter(sessionID, messageID).catch(() => undefined)
      if (!assistant) continue
      const failed = assistant.role === "assistant" && (assistant.finish === "error" || assistant.error !== undefined)
      return failed ? ("failed" as const) : ("success" as const)
    }
    return "failed" as const
  }

  const ensureSession = async () => {
    const existing = input.state().sessionID
    if (existing) return existing
    const created = await input.sdk().api.session.create({ location: { directory: input.directory() } })
    const raw = created as unknown
    const sessionID = isRecord(raw)
      ? isRecord(raw.data) && typeof raw.data.id === "string"
        ? raw.data.id
        : typeof raw.id === "string"
          ? raw.id
          : undefined
      : undefined
    if (!sessionID) throw new Error("session create returned no id")
    input.update((draft) => {
      draft.sessionID = sessionID
    })
    return sessionID
  }

  const runLoop = async (fileTasks: () => ParsedTask[]) => {
    let sessionID: string
    try {
      sessionID = await ensureSession()
    } catch {
      input.onError("session")
      input.update((draft) => {
        draft.running = false
      })
      return
    }

    const retried: string[] = []
    while (input.state().running) {
      const list = fullList(fileTasks())
      const queue = list.filter((task) => {
        const state = input.state().tasks[task.key]
        return !state || state.status === "pending" || state.status === "running"
      })
      const next = queue.find((task) => !retried.includes(task.key)) ?? queue[0]
      if (!next) break
      const position = list.findIndex((task) => task.key === next.key)
      const attempt = (input.state().tasks[next.key]?.attempts ?? 0) + 1
      const messageID = messageIDFor(next.key, attempt)
      setStatus(next.key, "running")
      input.update((draft) => {
        const state = draft.tasks[next.key]
        if (state) {
          state.attempts = attempt
          state.messageID = messageID
        }
      })

      try {
        await input.sdk().api.session.prompt({
          sessionID,
          id: messageID,
          text: planTaskPrompt({ text: next.text, index: position, total: list.length, attempt }),
        })
      } catch {
        input.onError("prompt")
        setStatus(next.key, attempt >= MAX_TASK_ATTEMPTS ? "failed" : "pending")
        if (attempt < MAX_TASK_ATTEMPTS) retried.push(next.key)
        continue
      }

      const outcome = await waitForCompletion(sessionID, messageID)
      if (!input.state().running) {
        // Paused mid-task: leave it pending so it re-runs on the next start.
        setStatus(next.key, "pending")
        break
      }
      if (outcome === "success") {
        setStatus(next.key, "done")
        const index = retried.indexOf(next.key)
        if (index !== -1) retried.splice(index, 1)
      } else if (attempt >= MAX_TASK_ATTEMPTS) {
        setStatus(next.key, "failed")
      } else {
        // Failed attempt: keep the pipeline moving, retry this task later.
        setStatus(next.key, "pending")
        retried.push(next.key)
      }
    }

    input.update((draft) => {
      draft.running = false
    })
  }

  return {
    syncTasks,
    start(fileTasks: () => ParsedTask[]) {
      if (input.state().running) return
      syncTasks(fileTasks())
      input.update((draft) => {
        draft.running = true
      })
      void runLoop(fileTasks).catch(() =>
        input.update((draft) => {
          draft.running = false
        }),
      )
    },
    // Graceful pause: the in-flight task finishes, no new task is admitted.
    pause() {
      input.update((draft) => {
        draft.running = false
      })
    },
    async stop() {
      this.pause()
      const sessionID = input.state().sessionID
      if (sessionID) await input.sdk().api.session.interrupt({ sessionID }).catch(() => undefined)
    },    reset() {
      this.pause()
      input.update((draft) => {
        for (const state of Object.values(draft.tasks)) {
          state.status = "pending"
          state.attempts = 0
          state.messageID = undefined
        }
      })
    },
    running: () => input.state().running,
  }
}
