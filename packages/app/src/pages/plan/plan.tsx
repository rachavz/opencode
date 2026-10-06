import { Button } from "@opencode-ai/ui/button"
import { Icon, type IconProps } from "@opencode-ai/ui/icon"
import { createEffect, createMemo, createResource, createSignal, For, Show } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { useParams } from "@solidjs/router"
import { Persist, persisted } from "@/utils/persist"
import { decode64 } from "@/utils/base64"
import { showToast } from "@/utils/toast"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { useServer } from "@/context/server"
import { useSync } from "@/context/sync"
import { useTabs } from "@/context/tabs"
import { sessionHref } from "@/utils/session-route"
import { parsePlanTasks } from "./plan-tasks"
import { createPlanRunner, type RunnerPlanState, type RunnerTaskStatus } from "./plan-runner"

const STATUS_ICON: Record<RunnerTaskStatus, IconProps["name"]> = {
  pending: "dot-grid",
  running: "task",
  done: "circle-check",
  failed: "circle-x",
}

function statusClass(status: RunnerTaskStatus) {
  if (status === "done") return "text-success-base"
  if (status === "failed") return "text-danger-base"
  if (status === "running") return "text-accent-base"
  return "text-icon-base"
}

export function PlanRoute() {
  const params = useParams<{ dir: string }>()
  const language = useLanguage()
  const sdk = useSDK()
  const server = useServer()
  const sync = useSync()
  const tabs = useTabs()
  const directory = createMemo(() => decode64(params.dir) ?? "")
  const [draft, setDraft] = createSignal("")
  const [adding, setAdding] = createSignal(false)

  const [state, setState] = persisted(
    Persist.workspace(directory(), "plan-runner"),
    createStore<RunnerPlanState>({ running: false, tasks: {}, uiTasks: [] }),
  )
  const update = (fn: (draft: RunnerPlanState) => void) => setState(produce(fn))

  const [fileContent, { refetch }] = createResource(
    () => directory(),
    async (dir) => {
      if (!dir) return undefined
      const data = await sdk()
        .client.file.read({ path: "PLAN.md" })
        .then((x) => x.data)
        .catch(() => undefined)
      const text = data?.type === "text" ? data.content : undefined
      return text && text.length > 0 ? text : undefined
    },
  )
  const fileTasks = createMemo(() => {
    const content = fileContent()
    return content ? parsePlanTasks(content) : []
  })

  const runner = createMemo(() =>
    createPlanRunner({
      directory,
      sdk,
      sessionStatus: (sessionID) => sync().data.session_status[sessionID]?.type,
      state: () => state,
      update,
      onError: (kind) => {
        showToast({
          variant: "error",
          title: language.t(kind === "session" ? "plan.toast.sessionFailed" : "plan.toast.promptFailed"),
        })
      },
    }),
  )

  // Keep persisted task state aligned with the current task list.
  createEffect(() => {
    if (fileContent.loading) return
    runner().syncTasks(fileTasks())
  })

  const tasks = createMemo(() => [
    ...fileTasks().map((task) => ({
      key: `file:${task.line}`,
      text: task.text,
      source: "file" as const,
      state: state.tasks[`file:${task.line}`],
    })),
    ...state.uiTasks.map((task) => ({
      key: `ui:${task.id}`,
      text: task.text,
      source: "ui" as const,
      state: state.tasks[`ui:${task.id}`],
    })),
  ])
  const progress = createMemo(() => {
    const list = tasks()
    return {
      done: list.filter((task) => task.state?.status === "done").length,
      failed: list.filter((task) => task.state?.status === "failed").length,
      total: list.length,
    }
  })

  const addTask = () => {
    const text = draft().trim()
    if (!text) return
    setAdding(true)
    try {
      const id = `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      update((d) => {
        d.uiTasks.push({ id, text })
        d.tasks[`ui:${id}`] = { status: "pending", attempts: 0 }
      })
      setDraft("")
    } finally {
      setAdding(false)
    }
  }

  const removeTask = (key: string) => {
    const id = key.slice("ui:".length)
    update((d) => {
      d.uiTasks = d.uiTasks.filter((task) => task.id !== id)
      delete d.tasks[key]
    })
  }

  const openSession = () => {
    const sessionID = state.sessionID
    if (!sessionID) return
    tabs.openProject({ server: server.key, directory: directory(), href: sessionHref(server.key, sessionID) })
  }

  return (
    <div class="flex-1 min-h-0 m-2 self-stretch flex overflow-hidden rounded-[10px] bg-v2-background-bg-base shadow-[var(--v2-elevation-raised)]">
      <div class="flex-1 min-h-0 flex flex-col gap-4 px-6 py-6 overflow-y-auto">
        <div class="flex items-start justify-between gap-4">
          <div class="flex flex-col gap-1 min-w-0">
            <div class="text-16-strong">{language.t("plan.title")}</div>
            <div class="text-13-regular text-text-weak truncate" title={directory()}>
              {directory()}
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <Show when={state.sessionID}>
              <Button variant="ghost" onClick={openSession}>
                {language.t("plan.session.open")}
              </Button>
            </Show>
            <Show
              when={!state.running}
              fallback={
                <>
                  <Button variant="ghost" onClick={() => runner().pause()}>
                    {language.t("plan.action.pause")}
                  </Button>
                  <Button variant="ghost" onClick={() => void runner().stop()}>
                    {language.t("plan.action.stop")}
                  </Button>
                </>
              }
            >
              <Button
                variant="primary"
                disabled={fileContent.loading || progress().total === 0}
                onClick={() => runner().start(fileTasks)}
              >
                {language.t("plan.action.start")}
              </Button>
            </Show>
          </div>
        </div>

        <div class="flex items-center justify-between gap-4">
          <div class="text-13-regular text-text-weak">
            {language.t("plan.progress", {
              done: progress().done,
              failed: progress().failed,
              total: progress().total,
            })}
          </div>
          <Show when={progress().total > 0}>
            <Button variant="ghost" size="small" onClick={() => runner().reset()}>
              {language.t("plan.action.reset")}
            </Button>
          </Show>
        </div>

        <Show when={!fileContent.loading && !fileContent()}>
          <div class="rounded-lg border border-border-weaker-base px-4 py-3 text-13-regular text-text-weak">
            {language.t("plan.file.missing")}
          </div>
        </Show>

        <div class="flex flex-col gap-1">
          <For each={tasks()}>
            {(task) => (
              <div class="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-raised-base-hover">
                <Icon
                  name={STATUS_ICON[task.state?.status ?? "pending"]}
                  size="small"
                  class={`mt-1 shrink-0 ${statusClass(task.state?.status ?? "pending")}`}
                />
                <div
                  class="flex-1 min-w-0 text-13-regular"
                  classList={{ "line-through opacity-60": task.state?.status === "done" }}
                >
                  {task.text}
                </div>
                <Show when={task.state && task.state.attempts > 1 && task.state.status !== "done"}>
                  <span class="shrink-0 text-12-regular text-text-weak">
                    {language.t("plan.attempts", { count: task.state.attempts })}
                  </span>
                </Show>
                <Show when={task.source === "ui" && !state.running}>
                  <button
                    class="shrink-0 text-icon-base hover:text-danger-base"
                    onClick={() => removeTask(task.key)}
                    aria-label={language.t("common.remove")}
                  >
                    <Icon name="close" size="small" />
                  </button>
                </Show>
              </div>
            )}
          </For>
        </div>

        <div class="mt-auto flex flex-col gap-2 pt-4">
          <div class="flex gap-2">
            <input
              class="flex-1 rounded-lg border border-border-weaker-base bg-surface-base px-3 py-2 text-13-regular outline-none focus:border-border-strong-base"
              placeholder={language.t("plan.task.add.placeholder")}
              value={draft()}
              disabled={adding()}
              onKeyDown={(event) => {
                if (event.key === "Enter") addTask()
              }}
              onInput={(event) => setDraft(event.currentTarget.value)}
            />
            <Button variant="ghost" disabled={!draft().trim()} onClick={() => addTask()}>
              {language.t("plan.task.add")}
            </Button>
          </div>
          <div class="flex items-center justify-between">
            <div class="text-12-regular text-text-weak">{language.t("plan.file.hint")}</div>
            <Button variant="ghost" size="small" onClick={() => void refetch()}>
              {language.t("plan.file.reload")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
