import { ContextRelayRpc } from "./rpc.js"
import {
  isRelayStatusSnapshot,
  noticeForRelayStatus,
  type RelayDatabaseStatus,
  type RelayNoticeVariant,
} from "./status.js"

const TUI_PLUGIN_ID = "opencode-context-relay.tui"

interface LocationRef {
  directory: string
  workspaceID?: string
}

interface RelayRpcEvent {
  data: unknown
  location: LocationRef
}

interface RelayRpcClient {
  status(input: Record<string, never>, options: { location: LocationRef }): Promise<unknown>
  events: {
    on(
      name: "status_changed",
      handler: (event: RelayRpcEvent) => void | Promise<void>,
    ): () => void
  }
}

interface RelayTuiContext {
  location?: LocationRef
  client: {
    rpc(definition: typeof ContextRelayRpc): RelayRpcClient
  }
  data: {
    location: {
      default(): LocationRef
    }
  }
  ui: {
    toast: {
      show(options: {
        title?: string
        message: string
        variant?: RelayNoticeVariant
        duration?: number
      }): void
    }
  }
}

const plugin = {
  id: TUI_PLUGIN_ID,
  async setup(context: RelayTuiContext) {
    const relay = context.client.rpc(ContextRelayRpc)
    const location = context.location ?? context.data.location.default()
    let lastStatus: RelayDatabaseStatus | undefined

    const applyStatus = (value: unknown) => {
      if (!isRelayStatusSnapshot(value)) return

      const notice = noticeForRelayStatus(
        lastStatus,
        value.status,
        lastStatus === undefined,
      )
      lastStatus = value.status

      if (notice) {
        context.ui.toast.show(notice)
      }
    }

    const stop = relay.events.on("status_changed", (event) => {
      if (event.location.directory !== location.directory) return
      applyStatus(event.data)
    })

    try {
      applyStatus(await relay.status({}, { location }))
    } catch {
      if (lastStatus === undefined) {
        context.ui.toast.show({
          title: "Context Relay",
          message:
            "Could not read Context Relay server status. The server plugin may be unavailable or a different version.",
          variant: "warning",
          duration: 8000,
        })
      }
    }

    return () => {
      stop()
    }
  },
}

export default plugin
