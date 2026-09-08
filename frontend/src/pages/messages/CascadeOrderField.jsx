import { ArrowDown, ArrowUp } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { CHANNEL_LABELS } from '@/lib/messaging-labels'

/**
 * Choix de l'ordre des canaux : on décoche ceux qu'on ne veut pas, on réordonne les
 * autres avec les flèches. Un seul canal coché = envoi sur ce canal uniquement.
 */
export default function CascadeOrderField({ value, onChange }) {
  function move(index, delta) {
    const target = index + delta
    if (target < 0 || target >= value.length) return
    const next = [...value]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  function toggle(index, enabled) {
    onChange(value.map((row, i) => (i === index ? { ...row, enabled } : row)))
  }

  const ranked = value.map((row, i) => ({
    ...row,
    rank: row.enabled ? value.slice(0, i + 1).filter((r) => r.enabled).length : null,
  }))

  return (
    <div className="space-y-1 rounded-md border border-border p-2">
      {ranked.map((row, index) => {
        return (
          <div key={row.channel} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={row.enabled}
              onCheckedChange={(v) => toggle(index, Boolean(v))}
              aria-label={`Utiliser ${CHANNEL_LABELS[row.channel]}`}
            />
            <span className="w-5 text-muted-foreground tabular-nums">
              {row.enabled ? `${row.rank}.` : '—'}
            </span>
            <span className={row.enabled ? 'font-medium' : 'text-muted-foreground'}>
              {CHANNEL_LABELS[row.channel]}
            </span>
            <div className="ml-auto flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={index === 0}
                onClick={() => move(index, -1)}
                aria-label="Monter"
              >
                <ArrowUp className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={index === ranked.length - 1}
                onClick={() => move(index, 1)}
                aria-label="Descendre"
              >
                <ArrowDown className="size-4" />
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
