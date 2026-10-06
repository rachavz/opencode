import { Button } from "@opencode-ai/ui/button"
import { createMemo, createResource, For, Show } from "solid-js"
import { useParams } from "@solidjs/router"
import type { Session } from "@opencode-ai/sdk/v2/client"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { decode64 } from "@/utils/base64"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { useServer } from "@/context/server"
import { useSync } from "@/context/sync"
import { useTabs } from "@/context/tabs"
import { sessionHref } from "@/utils/session-route"

type TimeLabelLanguage = { t: (key: string, params?: Record<string, string | number | boolean>) => string }

function timeLabel(language: TimeLabelLanguage, created?: number) {
  if (!created) return ""
  const minutes = Math.round((Date.now() - created) / 60000)
  if (minutes < 1) return language.t("home.sessions.group.today")
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.round(hours / 24)
  return `${days}d`
}

export function ProjectHome() {
  const params = useParams<{ dir: string }>()
  const language = useLanguage()
  const sdk = useSDK()
  const server = useServer()
  const sync = useSync()
  const tabs = useTabs()
  const directory = createMemo(() => decode64(params.dir) ?? "")
  const projectName = createMemo(() => directory().split("/").filter(Boolean).pop() ?? directory())

  const [sessions, { refetch }] = createResource(
    () => directory(),
    async (dir) => {
      const response = await sdk()
        .client.session.list({ directory: dir, limit: 50 })
        .catch(() => undefined)
      const list = Array.isArray(response?.data) ? response!.data : []
      return list
        .filter((item) => !!item?.id)
        .sort((a, b) => (b.time?.created ?? 0) - (a.time?.created ?? 0)) as Session[]
    },
  )

  const openSession = (sessionID: string) => {
    tabs.openProject({ server: server.key, directory: directory(), href: sessionHref(server.key, sessionID) })
  }

  const newSession = () => {
    void tabs.newDraft({ server: server.key, directory: directory() })
  }

  const working = (sessionID: string) => {
    const status = sync().data.session_status[sessionID]?.type
    return status === "busy" || status === "retry"
  }

  return (
    <div class="flex-1 min-h-0 m-2 self-stretch flex overflow-hidden rounded-[10px] bg-v2-background-bg-base shadow-[var(--v2-elevation-raised)]">
      <div class="flex-1 min-h-0 flex flex-col gap-4 px-6 py-6 overflow-y-auto">
        <div class="flex items-start justify-between gap-4">
          <div class="flex flex-col gap-1 min-w-0">
            <div class="text-16-strong">{projectName()}</div>
            <div class="text-13-regular text-text-weak truncate" title={directory()}>
              {directory()}
            </div>
          </div>
          <Button variant="primary" onClick={newSession}>
            {language.t("command.session.new")}
          </Button>
        </div>

        <div class="flex items-center justify-between gap-4">
          <div class="text-13-regular text-text-weak">
            {language.t("project.sessions.count", { count: sessions()?.length ?? 0 })}
          </div>
          <Button variant="ghost" size="small" onClick={() => void refetch()}>
            {language.t("project.sessions.reload")}
          </Button>
        </div>

        <Show when={!sessions.loading && (sessions()?.length ?? 0) === 0}>
          <div class="rounded-lg border border-border-weaker-base px-4 py-3 text-13-regular text-text-weak">
            {language.t("project.sessions.empty")}
          </div>
        </Show>

        <div class="flex flex-col gap-1">
          <For each={sessions()}>
            {(session) => (
              <button
                class="flex items-center gap-3 rounded-lg px-3 py-2 text-start hover:bg-surface-raised-base-hover"
                onClick={() => openSession(session.id)}
              >
                <span
                  class="size-2 shrink-0 rounded-full"
                  classList={{ "bg-accent-base animate-pulse": working(session.id), "bg-transparent": !working(session.id) }}
                />
                <span class="flex-1 min-w-0 truncate text-13-regular">
                  {session.title || language.t("project.sessions.untitled")}
                </span>
                <span class="shrink-0 text-12-regular text-text-weak">
                  {timeLabel(language, session.time?.created)}
                </span>
              </button>
            )}
          </For>
        </div>
      </div>
    </div>
  )
}
