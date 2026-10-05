import { ScrollView } from "@opencode-ai/ui/scroll-view"
import { Button } from "@opencode-ai/ui/button"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { createMemo, Show } from "solid-js"
import { createHomeController } from "./home/home-controller"
import { createHomeProjectsController } from "./home/home-projects-controller"
import { HomeProjectsView, HomeUtilityNav } from "./home/home-projects-view"
import { HomeProjects } from "./home/home-projects"
import { createHomeScrollController } from "./home/home-scroll-controller"
import { createHomeSessionSearchController } from "./home/home-session-search-controller"
import { createHomeSessionsController } from "./home/home-sessions-controller"
import { HomeSessions } from "./home/home-sessions"
import type { HomeProjectsController } from "./home/home-projects-controller"

export function NewHome() {
  const home = createHomeController()
  const projects = createHomeProjectsController(home)
  const sessions = createHomeSessionsController(home)
  const search = createHomeSessionSearchController(home, sessions)
  const scroll = createHomeScrollController(sessions.data.groups)
  const projectSelected = createMemo(() => projects.selection.value().directory !== undefined)
  return (
    <div
      class={`
        m-2 min-h-0 flex-1 self-stretch overflow-hidden rounded-[10px]
        bg-v2-background-bg-base shadow-[var(--v2-elevation-raised)]
      `}
    >
      <ScrollView
        class="h-full [container-type:size]"
        thumbContainer={scroll.viewport.thumbTrack}
        thumbHoverTarget={scroll.viewport.hoverTarget}
        viewportRef={scroll.viewport.setViewport}
        onScroll={(event) => scroll.viewport.update(event.currentTarget.scrollTop)}
        onWheel={scroll.viewport.containOuterWheel}
      >
        <Show when={projectSelected()} fallback={<HomeProjectsPage projects={projects} />}>
          <div
            class={`
              mx-auto grid min-h-full w-full max-w-[1080px] grid-rows-[auto_minmax(0,1fr)_auto] gap-4 px-3
              lg:grid-cols-[280px_minmax(0,720px)] lg:grid-rows-1 lg:gap-8 lg:px-6
            `}
          >
            <HomeProjects projects={projects} scroll={scroll} />
            <HomeSessions sessions={sessions} search={search} scroll={scroll} />
            <HomeUtilityNav
              class="flex lg:hidden"
              onOpenSettings={projects.utility.settings}
              onOpenHelp={projects.utility.help}
              language={projects.copy.language}
            />
          </div>
        </Show>
      </ScrollView>
    </div>
  )
}

// Projects-first landing: lists every project before any conversation is shown.
// Selecting a project switches to the sessions layout; clicking the active
// project again clears the selection and returns here.
function HomeProjectsPage(props: { projects: HomeProjectsController }) {
  const language = props.projects.copy.language
  const empty = createMemo(() => props.projects.project.list().length === 0)
  const primaryServer = () => props.projects.server.list()[0]
  const unreachable = () => props.projects.server.health(primaryServer())?.healthy === false
  return (
    <div class="mx-auto w-full max-w-[720px] px-3 pb-8 lg:px-6 lg:pt-[52px]">
      <Show
        when={!empty()}
        fallback={
          <div class="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
            <IconV2 name="folder-add-left" size="large" class="text-v2-icon-icon-muted" />
            <div class="text-v2-text-text-primary [font-weight:590]">{language.t("home.empty.title")}</div>
            <div class="max-w-[360px] text-v2-text-text-muted">{language.t("home.empty.description")}</div>
            <Button
              data-action="home-add-project"
              variant="primary"
              size="large"
              class="mt-2"
              disabled={!primaryServer() || unreachable()}
              onClick={() => primaryServer() && props.projects.project.choose(primaryServer())}
            >
              {language.t("home.project.add")}
            </Button>
          </div>
        }
      >
        <HomeProjectsView
          language={props.projects.copy.language}
          servers={props.projects.server.list}
          projects={props.projects.project.list}
          recentlyClosed={props.projects.project.recentlyClosed}
          selection={props.projects.selection.value}
          homedir={props.projects.project.homedir}
          serverHealth={props.projects.server.health}
          projectsForServer={props.projects.server.projects}
          collapsed={props.projects.server.collapsed}
          canDefaultServer={props.projects.server.canDefault}
          defaultServerKey={props.projects.server.defaultKey}
          canRevealProject={props.projects.project.canReveal}
          unseenCount={props.projects.project.unseenCount}
          onWheel={() => {}}
          onChooseProject={props.projects.project.choose}
          onFocusServer={props.projects.server.focus}
          onToggleCollapsed={props.projects.server.toggleCollapsed}
          onEditServer={props.projects.server.edit}
          onSetDefaultServer={props.projects.server.setDefault}
          onRemoveServer={props.projects.server.remove}
          onMoveProject={props.projects.project.move}
          onSelectProject={props.projects.project.select}
          onAddProjects={props.projects.project.add}
          onOpenProjectNewSession={props.projects.project.openNewSession}
          onEditProject={props.projects.project.edit}
          onRevealProject={props.projects.project.reveal}
          onClearNotifications={props.projects.project.clearNotifications}
          onCloseProject={props.projects.project.close}
          onOpenSettings={props.projects.utility.settings}
          onOpenHelp={props.projects.utility.help}
        />
      </Show>
    </div>
  )
}
