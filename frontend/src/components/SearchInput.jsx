import { Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * Champ de recherche : l'affichage suit la frappe, la valeur remontée au parent est
 * temporisée pour ne pas déclencher une requête par caractère. Le callback est gardé
 * dans une ref pour qu'une lambda inline côté parent ne réarme pas le minuteur à
 * chaque rendu (il ne se déclencherait alors jamais).
 */
export default function SearchInput({
  onChange,
  placeholder = 'Rechercher...',
  className,
  delay = 300,
}) {
  const [text, setText] = useState('')
  const callbackRef = useRef(onChange)

  useEffect(() => {
    callbackRef.current = onChange
  }, [onChange])

  useEffect(() => {
    const timer = setTimeout(() => callbackRef.current(text.trim()), delay)
    return () => clearTimeout(timer)
  }, [text, delay])

  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-9"
      />
      {text && (
        <button
          type="button"
          onClick={() => setText('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="Effacer la recherche"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}
