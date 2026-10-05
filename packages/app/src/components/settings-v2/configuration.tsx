import { Component, createMemo, createSignal, Show } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { useLanguage } from "@/context/language"
import { useServerSync } from "@/context/server-sync"
import type { Config } from "@opencode-ai/sdk/v2/client"

// Transparent configuration: shows the full effective session/project config
// exactly as the server resolved it, and lets the user edit every field.
export const SettingsConfiguration: Component = () => {
  const language = useLanguage()
  const sync = useServerSync()
  const configText = createMemo(() => JSON.stringify(sync().data.config ?? {}, null, 2))
  const [draft, setDraft] = createSignal<string | undefined>(undefined)
  const [error, setError] = createSignal<string | undefined>(undefined)
  const [saving, setSaving] = createSignal(false)
  const value = () => draft() ?? configText()
  const dirty = () => draft() !== undefined && draft() !== configText()

  const save = async () => {
    setError(undefined)
    let parsed: Config
    try {
      parsed = JSON.parse(value()) as Config
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : language.t("settings.config.invalid"))
      return
    }
    setSaving(true)
    try {
      await sync().updateConfig(parsed)
      setDraft(undefined)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : language.t("settings.config.invalid"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div class="flex flex-col gap-4 min-h-0 h-full">
      <div class="flex flex-col gap-1">
        <div class="text-16-strong">{language.t("settings.tab.configuration")}</div>
        <div class="text-13-regular text-text-weak">{language.t("settings.config.description")}</div>
      </div>
      <textarea
        class="flex-1 min-h-0 w-full resize-none rounded-lg border border-border-weaker-base bg-surface-base p-3 font-mono text-12-regular text-text-base outline-none focus:border-border-strong-base"
        spellcheck={false}
        value={value()}
        onInput={(event) => setDraft(event.currentTarget.value)}
      />
      <div class="flex items-center justify-between gap-3">
        <Show when={error()}>
          <div class="min-w-0 flex-1 truncate text-12-regular text-danger-base" title={error()}>
            {error()}
          </div>
        </Show>
        <Show when={!error()}>
          <div class="flex-1" />
        </Show>
        <Button variant="ghost" disabled={!dirty() || saving()} onClick={() => setDraft(undefined)}>
          {language.t("settings.config.reset")}
        </Button>
        <Button variant="primary" disabled={!dirty() || saving()} onClick={() => void save()}>
          {language.t(saving() ? "settings.config.saving" : "settings.config.save")}
        </Button>
      </div>
    </div>
  )
}
