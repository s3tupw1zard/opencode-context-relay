import { Plugin } from "@opencode/plugin/tui"
import { ContextRelayRpc } from "./rpc.js"
import {
  isRelayStatusSnapshot,
  noticeForRelayStatus,
  type RelayDatabaseStatus,
} from "./status.js"

const TUI_PLUGIN_ID = "opencode-context-relay.tui"

const plugin = Plugin.define({
  id: TUI_PLUGIN_ID,
  async setup(context) {
    const relay = context.client.rpc(ContextRelayRpc)
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
      applyStatus(event.data)
    })

    try {
      applyStatus(await relay.status({}))
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
})

export default plugin
