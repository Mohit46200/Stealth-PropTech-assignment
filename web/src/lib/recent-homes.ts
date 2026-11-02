import type { Home } from './api'

// Remembers homes opened in this browser so they are one click away. Purely a convenience:
// storage can be unavailable (private mode), so every access is guarded.
const STORAGE_KEY = 'bill-splitter:recent-homes'
const MAX_RECENT = 8

export function loadRecentHomes(): Home[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isHome)
  } catch {
    return []
  }
}

export function rememberHome(home: Home): void {
  try {
    const others = loadRecentHomes().filter((recent) => recent.id !== home.id)
    const next = [{ id: home.id, name: home.name }, ...others].slice(0, MAX_RECENT)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage is optional.
  }
}

function isHome(value: unknown): value is Home {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'name' in value &&
    typeof value.id === 'string' &&
    typeof value.name === 'string'
  )
}
