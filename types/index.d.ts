export type NeedsYou = string | null

declare module 'claude-code' {
  interface PluginState {
    skim: { needsYou: NeedsYou; expanded: StateFamily<boolean> }
  }
}
