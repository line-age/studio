import { StatusBar } from "@/components/status-bar"

import { useCamera } from "../studio-store"

/** The foot of the list: the map's zoom, and where its centre is. */
export function CameraStatus() {
  const zoom = useCamera((s) => s.zoom)
  const center = useCamera((s) => s.center)
  return (
    // Each number says what it is: the map's zoom, and the latitude and
    // longitude at its centre.
    <StatusBar
      zoom={zoom === null ? "" : `Zoom ${zoom.toFixed(2)}`}
      position={
        center === null
          ? ""
          : `Centre ${center[1].toFixed(3)}, ${center[0].toFixed(3)}`
      }
    />
  )
}
