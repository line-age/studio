import { Component, type ErrorInfo, type ReactNode } from "react"

/** Catches a render or data error below it and shows `fallback` instead. */
export class ErrorBoundary extends Component<
  { fallback: (error: Error) => ReactNode; children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  render() {
    return this.state.error
      ? this.props.fallback(this.state.error)
      : this.props.children
  }
}
