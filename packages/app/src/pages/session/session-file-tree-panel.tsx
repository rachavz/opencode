import { createMediaQuery } from "@solid-primitives/media"
import { Show, createMemo, type JSX } from "solid-js"
import { Tabs } from "@opencode-ai/ui/tabs"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import type { SnapshotFileDiff, VcsFileDiff } from "@opencode-ai/sdk/v2"
import type { FileDiffInfo } from "@opencode-ai/client/promise"
import FileTree from "@/components/file-tree"
import { normalizeFileTreeV2Path } from "@/components/file-tree-v2-model"
import { useFile } from "@/context/file"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useSettings } from "@/context/settings"
import type { Sizing } from "@/pages/session/helpers"

type ReviewDiff = FileDiffInfo | SnapshotFileDiff | VcsFileDiff
type RenderDiff = FileDiffInfo | (SnapshotFileDiff & { file: string }) | VcsFileDiff

const FILE_TREE_WIDTH_MIN = 240

function renderDiff(value: ReviewDiff): value is RenderDiff {
  return typeof value.file === "string"
}

type SessionFileTreePanelProps = {
  diffs: () => ReviewDiff[]
  diffsReady: () => boolean
  hasReview: () => boolean
  reviewCount: () => number
  activeDiff: () => string | undefined
  focusReviewDiff: (path: string) => void
  onOpenFile: (path: string) => void
  size: Sizing
}

// VSCode-style explorer docked to the inline-start edge of the session view.
export function SessionFileTreePanel(props: SessionFileTreePanelProps) {
  const layout = useLayout()
  const settings = useSettings()
  const file = useFile()
  const language = useLanguage()
  const isDesktop = createMediaQuery("(min-width: 768px)")

  const fileOpen = createMemo(() => isDesktop() && layout.fileTree.opened())
  const fileTreeWidth = createMemo(() => Math.max(FILE_TREE_WIDTH_MIN, layout.fileTree.width()))

  const diffs = createMemo(() => props.diffs().filter(renderDiff))
  const diffFiles = createMemo(() => diffs().map((d) => d.file))
  const kinds = createMemo(() => {
    const merge = (a: "add" | "del" | "mix" | undefined, b: "add" | "del" | "mix") => {
      if (!a) return b
      if (a === b) return a
      return "mix" as const
    }

    const out = new Map<string, "add" | "del" | "mix">()
    for (const diff of diffs()) {
      const path = normalizeFileTreeV2Path(diff.file)
      const kind = diff.status === "added" ? "add" : diff.status === "deleted" ? "del" : "mix"

      out.set(path, kind)

      const parts = path.split("/")
      for (const [idx] of parts.slice(0, -1).entries()) {
        const dir = parts.slice(0, idx + 1).join("/")
        if (!dir) continue
        out.set(dir, merge(out.get(dir), kind))
      }
    }
    return out
  })

  const nofiles = createMemo(() => {
    const state = file.tree.state("")
    if (!state?.loaded) return false
    return file.tree.children("").length === 0
  })

  const fileTreeTab = () => layout.fileTree.tab()
  const setFileTreeTabValue = (value: string) => {
    if (value !== "changes" && value !== "all") return
    layout.fileTree.setTab(value)
  }

  const empty = (msg: string): JSX.Element => (
    <div class="h-full flex flex-col">
      <div class="h-6 shrink-0" aria-hidden />
      <div class="flex-1 pb-64 flex items-center justify-center text-center">
        <div class="text-12-regular text-text-weak">{msg}</div>
      </div>
    </div>
  )

  return (
    <Show when={fileOpen()}>
      <div
        id="file-tree-panel"
        class="relative min-w-0 h-full shrink-0 overflow-hidden border-e border-border-weaker-base"
        classList={{
          "transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width] motion-reduce:transition-none":
            !props.size.active(),
        }}
        style={{ width: `${fileTreeWidth()}px` }}
      >
        <div class="h-full flex flex-col overflow-hidden group/filetree">
          <Tabs variant="pill" value={fileTreeTab()} onChange={setFileTreeTabValue} class="h-full" data-scope="filetree">
            <Tabs.List>
              <Tabs.Trigger value="changes" class="flex-1" classes={{ button: "w-full" }}>
                <Show
                  when={settings.general.newLayoutDesigns()}
                  fallback={
                    <>
                      {props.reviewCount()}{" "}
                      {language.t(props.reviewCount() === 1 ? "session.review.change.one" : "session.review.change.other")}
                    </>
                  }
                >
                  {language.t("session.review.filesChanged", { count: props.reviewCount() })}
                </Show>
              </Tabs.Trigger>
              <Tabs.Trigger value="all" class="flex-1" classes={{ button: "w-full" }}>
                {language.t("session.files.all")}
              </Tabs.Trigger>
            </Tabs.List>
            <Show when={fileTreeTab() === "changes"}>
              <Tabs.Content value="changes" class="bg-background-stronger px-3 py-0">
                <Show
                  when={props.diffsReady()}
                  fallback={
                    <div class="px-2 py-2 text-12-regular text-text-weak">
                      {language.t("common.loading")}
                      {language.t("common.loading.ellipsis")}
                    </div>
                  }
                >
                  <Show when={props.hasReview() || !props.diffsReady()}>
                    <FileTree
                      path=""
                      class="pt-3"
                      allowed={diffFiles()}
                      kinds={kinds()}
                      draggable={false}
                      active={props.activeDiff()}
                      onFileClick={(node) => props.focusReviewDiff(node.path)}
                    />
                  </Show>
                </Show>
              </Tabs.Content>
            </Show>
            <Show when={fileTreeTab() === "all"}>
              <Tabs.Content value="all" class="bg-background-stronger px-3 py-0">
                {nofiles() ? (
                  empty(language.t("session.files.empty"))
                ) : (
                  <FileTree
                    path=""
                    class="pt-3"
                    modified={diffFiles()}
                    kinds={kinds()}
                    onFileClick={(node) => props.onOpenFile(node.path)}
                  />
                )}
              </Tabs.Content>
            </Show>
          </Tabs>
        </div>
        <div onPointerDown={() => props.size.start()}>
          <ResizeHandle
            direction="horizontal"
            edge="end"
            size={fileTreeWidth()}
            min={FILE_TREE_WIDTH_MIN}
            max={480}
            onResize={(width) => {
              props.size.touch()
              layout.fileTree.resize(width)
            }}
          />
        </div>
      </div>
    </Show>
  )
}
