import { Component, type ReactNode } from 'react'

export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false }
  static getDerivedStateFromError() { return { error: true } }
  render() {
    if (this.state.error) return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#050816' }}>
        <div className="text-center">
          <p className="text-4xl mb-4">🚀</p>
          <p className="text-white font-bold mb-2">Loading SpaceHub...</p>
          <button onClick={() => window.location.reload()} className="text-indigo-400 text-sm hover:underline">Reload</button>
        </div>
      </div>
    )
    return this.props.children
  }
}
