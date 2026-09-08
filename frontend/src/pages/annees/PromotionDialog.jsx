import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { fetchClasses, promouvoirAnnee } from '@/lib/schools-api'

const SORTIE = 'sortie'

/**
 * Passage en classe supérieure : réinscrit en masse les élèves d'une année sur la suivante.
 *
 * Rien n'est deviné — l'utilisateur associe lui-même chaque classe source à sa classe
 * cible. Une classe laissée sur « quittent l'école » diplôme ses élèves au lieu de les
 * réinscrire, ce qui est le cas normal des classes de fin de cycle.
 *
 * Le parent le monte avec une `key` liée à l'année source : la saisie repart donc de zéro
 * à chaque ouverture, sans effet de remise à zéro.
 */
export default function PromotionDialog({ open, onOpenChange, anneeSource, annees }) {
  const queryClient = useQueryClient()
  const [anneeCibleId, setAnneeCibleId] = useState('')
  const [mapping, setMapping] = useState({})

  const cibles = annees.filter((a) => a.id !== anneeSource?.id)

  const { data: classesSource = [], isLoading: loadingSource } = useQuery({
    queryKey: ['classes', anneeSource?.id],
    queryFn: () => fetchClasses(undefined, anneeSource.id),
    enabled: open && Boolean(anneeSource),
  })

  const { data: classesCible = [], isLoading: loadingCible } = useQuery({
    queryKey: ['classes', Number(anneeCibleId)],
    queryFn: () => fetchClasses(undefined, Number(anneeCibleId)),
    enabled: open && Boolean(anneeCibleId),
  })

  const mutation = useMutation({
    mutationFn: () =>
      promouvoirAnnee(anneeSource.id, {
        anneeCible: Number(anneeCibleId),
        // Les classes laissées sur « quittent l'école » sont volontairement absentes
        // du mapping : le backend les traite comme des sorties.
        mapping: Object.fromEntries(
          Object.entries(mapping).filter(([, v]) => v && v !== SORTIE),
        ),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['eleves'] })
      queryClient.invalidateQueries({ queryKey: ['classes'] })
      queryClient.invalidateQueries({ queryKey: ['annees'] })
      toast.success(
        `${data.promus} élève(s) réinscrit(s), ${data.sortants} sorti(s) de l'école`,
      )
      onOpenChange(false)
    },
    onError: (err) =>
      toast.error(err?.response?.data?.annee_cible || 'Le passage de classe a échoué'),
  })

  const pretAValider = Boolean(anneeCibleId) && classesSource.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Passage en classe supérieure</DialogTitle>
          <DialogDescription>
            Depuis <span className="font-medium">{anneeSource?.label}</span>. L'historique
            de l'année source est conservé : les élèves y restent inscrits.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Année d'arrivée</p>
            <Select value={anneeCibleId} onValueChange={setAnneeCibleId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choisir l'année de destination" />
              </SelectTrigger>
              <SelectContent>
                {cibles.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {anneeCibleId && (loadingSource || loadingCible) && <Skeleton className="h-32 w-full" />}

          {anneeCibleId && !loadingSource && !loadingCible && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Correspondance des classes</p>
              {classesSource.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Aucune classe sur {anneeSource?.label}.
                </p>
              )}
              {classesCible.length === 0 && classesSource.length > 0 && (
                <p className="text-sm text-amber-600">
                  L'année {cibles.find((a) => a.id === Number(anneeCibleId))?.label} n'a
                  encore aucune classe. Créez-les d'abord, sinon tous les élèves seront
                  marqués sortants.
                </p>
              )}
              <div className="max-h-72 space-y-2 overflow-auto rounded-lg border border-border p-3">
                {classesSource.map((c) => (
                  <div key={c.id} className="flex items-center gap-3">
                    <span className="w-40 shrink-0 truncate text-sm">
                      {c.name}
                      <span className="ml-1 text-muted-foreground">({c.eleves_count})</span>
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                    <Select
                      value={mapping[c.id] ?? SORTIE}
                      onValueChange={(v) => setMapping((prev) => ({ ...prev, [c.id]: v }))}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SORTIE}>Quittent l'école (diplômés)</SelectItem>
                        {classesCible.map((cc) => (
                          <SelectItem key={cc.id} value={String(cc.id)}>
                            {cc.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!pretAValider || mutation.isPending}
          >
            {mutation.isPending ? 'Passage en cours...' : 'Lancer le passage'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
