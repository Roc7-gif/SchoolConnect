import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import SearchInput from '@/components/SearchInput'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Sélection multiple avec recherche serveur (tolérante aux fautes de frappe côté API).
 * Les éléments cochés restent affichés en badges même si la recherche en cours les
 * exclut de la liste, sinon on ne pourrait plus les retirer.
 *
 * `queryFn` reçoit le terme de recherche ; `getLabel`/`getHint` décrivent une ligne.
 */
export default function SearchMultiSelect({
  value = [],
  onChange,
  queryKey,
  queryFn,
  getLabel,
  getHint,
  disabledIds,
  disabledLabel,
  enabled = true,
  placeholder = 'Rechercher...',
  emptyLabel = 'Aucun résultat',
}) {
  const [search, setSearch] = useState('')
  const [known, setKnown] = useState(() => new Map())

  const { data: items = [], isLoading } = useQuery({
    queryKey: [...queryKey, search],
    queryFn: () => queryFn(search),
    enabled,
  })

  function toggle(item, checked) {
    if (checked) {
      setKnown((prev) => new Map(prev).set(item.id, item))
      onChange([...value, item.id])
    } else {
      onChange(value.filter((id) => id !== item.id))
    }
  }

  const selected = value.map((id) => known.get(id)).filter(Boolean)

  return (
    <div className="space-y-2">
      <SearchInput onChange={setSearch} placeholder={placeholder} />

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((item) => (
            <Badge key={item.id} variant="secondary" className="gap-1">
              {getLabel(item)}
              <button
                type="button"
                onClick={() => toggle(item, false)}
                aria-label={`Retirer ${getLabel(item)}`}
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="max-h-44 overflow-auto rounded-md border border-border p-2">
        {isLoading ? (
          <Skeleton className="h-6 w-full" />
        ) : items.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {search ? `Aucun résultat pour « ${search} »` : emptyLabel}
          </p>
        ) : (
          items.map((item) => {
            const isDisabled = Boolean(disabledIds?.has(item.id))
            const hint = getHint?.(item)
            return (
              <label
                key={item.id}
                className={`flex items-center gap-2 py-1 text-sm ${isDisabled ? 'opacity-50' : ''}`}
              >
                <Checkbox
                  checked={isDisabled || value.includes(item.id)}
                  disabled={isDisabled}
                  onCheckedChange={(v) => toggle(item, Boolean(v))}
                />
                {getLabel(item)}
                {hint ? <span className="text-muted-foreground">({hint})</span> : null}
                {isDisabled && disabledLabel && (
                  <span className="text-xs text-muted-foreground">— {disabledLabel}</span>
                )}
              </label>
            )
          })
        )}
      </div>
    </div>
  )
}
