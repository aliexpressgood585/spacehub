export default function Header({ onThemeToggle }: { onThemeToggle: () => void }) {
  return (
    <header className="glass sticky top-0 z-50 border-b border-space-700">
      <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="text-3xl">🚀</div>
          <h1 className="gradient-text text-2xl font-bold">SpaceHub</h1>
        </div>
        <p className="text-gray-400 text-sm">מידע חלל בזמן אמת</p>
        <button onClick={onThemeToggle} className="p-2 hover:bg-space-700 rounded">
          🌙
        </button>
      </div>
    </header>
  )
}
