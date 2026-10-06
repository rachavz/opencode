import { ScrollView } from "@opencode-ai/ui/scroll-view"
import { createHomeController } from "./home/home-controller"
import { createHomeProjectsController } from "./home/home-projects-controller"
import { HomeProjectsView, HomeUtilityNav } from "./home/home-projects-view"
import { createHomeScrollController } from "./home/home-scroll-controller"
import { createHomeSessionSearchController } from "./home/home-session-search-controller"
import { createHomeSessionsController } from "./home/home-sessions-controller"

// Home is a projects launcher: clicking a project opens it as a project tab,
// and its sessions live inside that tab (plus the sidebar).
export function NewHome() {
  const home = createHomeController()
  const projects = createHomeProjectsController(home)
  // Session index keeps running in the background (retention + palette).
  const sessions = createHomeSessionsController(home)
  createHomeSessionSearchController(home, sessions)
  const scroll = createHomeScrollController(sessions.data.groups)
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
        <div class="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-3 pb-8 lg:px-6 lg:pt-[52px]">
          <HomeProjectsView
            language={projects.copy.language}
            servers={projects.server.list}
            projects={projects.project.list}
            recentlyClosed={projects.project.recentlyClosed}
            selection={projects.selection.value}
            homedir={projects.project.homedir}
            serverHealth={projects.server.health}
            projectsForServer={projects.server.projects}
            collapsed={projects.server.collapsed}
            canDefaultServer={projects.server.canDefault}
            defaultServerKey={projects.server.defaultKey}
            canRevealProject={projects.project.canReveal}
            unseenCount={projects.project.unseenCount}
            onWheel={() => {}}
            onChooseProject={projects.project.choose}
            onFocusServer={projects.server.focus}
            onToggleCollapsed={projects.server.toggleCollapsed}
            onEditServer={projects.server.edit}
            onSetDefaultServer={projects.server.setDefault}
            onRemoveServer={projects.server.remove}
            onMoveProject={projects.project.move}
            onSelectProject={projects.project.select}
            onOpenProject={projects.project.open}
            onAddProjects={projects.project.add}
            onOpenProjectNewSession={projects.project.openNewSession}
            onOpenPlan={projects.project.openPlan}
            onEditProject={projects.project.edit}
            onRevealProject={projects.project.reveal}
            onClearNotifications={projects.project.clearNotifications}
            onCloseProject={projects.project.close}
            onOpenSettings={projects.utility.settings}
            onOpenHelp={projects.utility.help}
          />
          <HomeUtilityNav
            class="flex lg:hidden"
            onOpenSettings={projects.utility.settings}
            onOpenHelp={projects.utility.help}
            language={projects.copy.language}
          />
        </div>
      </ScrollView>
    </div>
  )
}
