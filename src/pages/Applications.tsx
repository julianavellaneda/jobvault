import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronRight, Inbox, Plus, Search } from 'lucide-react'
import type { NewApplication } from '@/storage/adapter'
import type { Application, Status } from '@/types'
import { STATUSES, STATUS_LABELS } from '@/types'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/Chip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ApplicationRow, ROW_GRID } from '@/components/ApplicationRow'
import { AddApplicationDialog } from '@/components/AddApplicationDialog'
import {
  defaultSortDir,
  groupApps,
  parseGroupBy,
  parseSortBy,
  parseSortDir,
  sortApps,
  type GroupBy,
  type SortBy,
  type SortDir,
} from '@/lib/applicationsView'
import { STATUS_DOT } from '@/lib/statusColors'
import { cn } from '@/lib/utils'

const LS_GROUP_BY = 'applications.groupBy'
const LS_SORT_BY = 'applications.sortBy'
const LS_SORT_DIR = 'applications.sortDir'

export function Applications({
  apps,
  loading,
  createApp,
  updateApp,
  removeApp,
}: {
  apps: Application[]
  loading: boolean
  createApp: (input: NewApplication) => Promise<Application | null>
  updateApp: (id: string, patch: Partial<Application>) => Promise<void>
  removeApp: (id: string) => Promise<void>
}) {
  const [search, setSearch] = useState('')
  const [activeStatuses, setActiveStatuses] = useState<Set<Status>>(new Set())
  const [activeSources, setActiveSources] = useState<Set<string>>(new Set())
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set())

  const [groupBy, setGroupBy] = useState<GroupBy>(() =>
    parseGroupBy(typeof localStorage !== 'undefined' ? localStorage.getItem(LS_GROUP_BY) : null),
  )
  const [sortBy, setSortBy] = useState<SortBy>(() =>
    parseSortBy(typeof localStorage !== 'undefined' ? localStorage.getItem(LS_SORT_BY) : null),
  )
  const [sortDir, setSortDir] = useState<SortDir>(() =>
    parseSortDir(typeof localStorage !== 'undefined' ? localStorage.getItem(LS_SORT_DIR) : null),
  )
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    localStorage.setItem(LS_GROUP_BY, groupBy)
  }, [groupBy])
  useEffect(() => {
    localStorage.setItem(LS_SORT_BY, sortBy)
  }, [sortBy])
  useEffect(() => {
    localStorage.setItem(LS_SORT_DIR, sortDir)
  }, [sortDir])

  const allSources = useMemo(() => {
    const s = new Set<string>()
    for (const a of apps) if (a.source.trim()) s.add(a.source.trim())
    return Array.from(s).sort()
  }, [apps])

  const allTags = useMemo(() => {
    const s = new Set<string>()
    for (const a of apps) for (const t of a.tags) s.add(t)
    return Array.from(s).sort()
  }, [apps])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return apps.filter(a => {
      if (activeStatuses.size && !activeStatuses.has(a.status)) return false
      if (activeSources.size && !activeSources.has(a.source.trim())) return false
      if (activeTags.size && !a.tags.some(t => activeTags.has(t))) return false
      if (q) {
        const hay = [a.company, a.role, a.url, a.notes, a.location].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [apps, search, activeStatuses, activeSources, activeTags])

  const groups = useMemo(
    () => groupApps(sortApps(filtered, sortBy, sortDir), groupBy),
    [filtered, sortBy, sortDir, groupBy],
  )

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  function toggle<T>(set: Set<T>, value: T, setter: (v: Set<T>) => void) {
    const next = new Set(set)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    setter(next)
  }

  function handleSortByChange(v: SortBy) {
    setSortBy(v)
    setSortDir(defaultSortDir(v))
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-3">
        {/* Page head */}
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Applications</h1>
          <span className="rounded-full bg-[var(--color-surface-2)] px-2.5 py-0.5 text-sm tabular-nums text-[var(--color-muted-foreground)]">
            {filtered.length}/{apps.length}
          </span>
          <AddApplicationDialog createApp={createApp}>
            <Button size="sm" className="ml-auto">
              <Plus className="size-4" />
              Add manually
            </Button>
          </AddApplicationDialog>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by company, role, url, notes…"
              className="pl-8"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
              Group
            </span>
            <Select value={groupBy} onValueChange={v => setGroupBy(v as GroupBy)}>
              <SelectTrigger className="h-8 w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="status">Status</SelectItem>
                <SelectItem value="source">Source</SelectItem>
                <SelectItem value="month">Month added</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
              Sort
            </span>
            <Select value={sortBy} onValueChange={v => handleSortByChange(v as SortBy)}>
              <SelectTrigger className="h-8 w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="createdAt">Date added</SelectItem>
                <SelectItem value="appliedAt">Date applied</SelectItem>
                <SelectItem value="deadline">Deadline</SelectItem>
                <SelectItem value="company">Company</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
              title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
            >
              {sortDir === 'asc' ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
            </Button>
          </div>
        </div>

        {/* Filter chips */}
        <FilterChips
          label="Status"
          options={STATUSES}
          getLabel={s => STATUS_LABELS[s]}
          getDot={s => STATUS_DOT[s]}
          active={activeStatuses}
          onToggle={v => toggle(activeStatuses, v, setActiveStatuses)}
        />
        {allSources.length > 0 && (
          <FilterChips
            label="Source"
            options={allSources}
            getLabel={s => s}
            active={activeSources}
            onToggle={v => toggle(activeSources, v, setActiveSources)}
          />
        )}
        {allTags.length > 0 && (
          <FilterChips
            label="Tags"
            options={allTags}
            getLabel={s => s}
            active={activeTags}
            onToggle={v => toggle(activeTags, v, setActiveTags)}
          />
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-center text-sm text-[var(--color-muted-foreground)]">
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
              <div className="inline-flex size-12 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] ring-1 ring-inset ring-[var(--color-primary)]/20">
                <Inbox className="size-5" />
              </div>
              <div className="text-sm text-[var(--color-muted-foreground)]">
                {apps.length === 0
                  ? 'No applications yet. Head to Add Links to paste some URLs.'
                  : 'No matches for your filters.'}
              </div>
            </div>
          ) : (
            <div>
              {/* Desktop-only list header — shares ROW_GRID with CompactRow */}
              <div
                className={cn(
                  ROW_GRID,
                  'hidden border-l-4 border-transparent px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-[var(--color-faint)] md:grid',
                )}
              >
                {/* chevron placeholder */}
                <span />
                {/* monogram placeholder */}
                <span />
                {/* company / role */}
                <span>Company / Role</span>
                {/* salary */}
                <span>Salary</span>
                {/* location */}
                <span>Location</span>
                {/* tags */}
                <span>Tags</span>
                {/* status */}
                <span>Status</span>
                {/* added */}
                <span>Added</span>
                {/* ext-link placeholder */}
                <span />
              </div>

              {groups.map(g => {
                const isCollapsed = collapsedGroups.has(g.key)
                const showHeader = groupBy !== 'none'
                return (
                  <section key={g.key} className="border-b last:border-b-0">
                    {showHeader && (
                      <button
                        type="button"
                        onClick={() => toggleGroup(g.key)}
                        className="flex w-full items-center gap-2 bg-[var(--color-muted)]/40 px-3 py-2 text-left text-sm hover:bg-[var(--color-muted)]/60"
                      >
                        <ChevronRight
                          className={cn(
                            'size-4 transition-transform text-[var(--color-muted-foreground)]',
                            !isCollapsed && 'rotate-90',
                          )}
                        />
                        {groupBy === 'status' && (
                          <span
                            className={cn('size-2 rounded-full', STATUS_DOT[g.key as Status])}
                          />
                        )}
                        <span className="font-medium">{g.label}</span>
                        <span className="text-xs tabular-nums text-[var(--color-muted-foreground)]">
                          {g.items.length}
                        </span>
                      </button>
                    )}
                    {!isCollapsed && (
                      <div className="divide-y">
                        {g.items.map(app => (
                          <ApplicationRow
                            key={app.id}
                            app={app}
                            expanded={expandedIds.has(app.id)}
                            onToggle={() => toggleExpanded(app.id)}
                            onUpdate={updateApp}
                            onRemove={removeApp}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function FilterChips<T>({
  label,
  options,
  getLabel,
  getDot,
  active,
  onToggle,
}: {
  label: string
  options: T[]
  getLabel: (v: T) => string
  getDot?: (v: T) => string
  active: Set<T>
  onToggle: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
        {label}
      </span>
      {options.map(o => (
        <Chip
          key={String(o)}
          active={active.has(o)}
          onClick={() => onToggle(o)}
          dot={getDot ? getDot(o) : undefined}
        >
          {getLabel(o)}
        </Chip>
      ))}
    </div>
  )
}
