import { CalendarDays } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAnnee } from '@/lib/annee'

/**
 * Sélecteur d'année scolaire, présent dans l'en-tête de toutes les pages : les listes et
 * les envois portent sur l'année choisie, il faut donc pouvoir la lire d'un coup d'œil.
 */
export default function AnneeSelector() {
  const { annees, anneeId, changerAnnee, isLoading } = useAnnee()

  if (isLoading || !annees.length) return null

  return (
    <div className="flex items-center gap-2">
      <CalendarDays className="size-4 text-muted-foreground" />
      <Select value={anneeId ? String(anneeId) : ''} onValueChange={(v) => changerAnnee(Number(v))}>
        <SelectTrigger className="w-[190px]" aria-label="Année scolaire">
          <SelectValue placeholder="Année scolaire" />
        </SelectTrigger>
        <SelectContent>
          {annees.map((a) => (
            <SelectItem key={a.id} value={String(a.id)}>
              <span className="flex items-center gap-2">
                {a.label}
                {a.is_current && (
                  <Badge variant="secondary" className="text-xs">
                    en cours
                  </Badge>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
