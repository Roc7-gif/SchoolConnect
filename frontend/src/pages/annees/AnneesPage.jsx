import { ArrowUpRight, CheckCircle2, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAnnee } from '@/lib/annee'

import AnneeFormDialog from './AnneeFormDialog'
import PromotionDialog from './PromotionDialog'

export default function AnneesPage() {
  const { annees, annee, isLoading, definirCourante, changerAnnee } = useAnnee()
  const [formOpen, setFormOpen] = useState(false)
  const [promotion, setPromotion] = useState(null)

  async function basculer(a) {
    try {
      await definirCourante(a.id)
      changerAnnee(a.id)
      toast.success(`${a.label} est maintenant l'année en cours`)
    } catch {
      toast.error("Impossible de changer l'année en cours")
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-semibold">Années scolaires</h2>
          <p className="text-sm text-muted-foreground">
            Classes, élèves et messages se rapportent tous à une année. L'année en cours est
            celle proposée par défaut à la connexion.
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="size-4" />
          Nouvelle année
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Année</TableHead>
              <TableHead>Période</TableHead>
              <TableHead>Classes</TableHead>
              <TableHead>Élèves inscrits</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ) : annees.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Aucune année scolaire. Créez-en une pour commencer à saisir des classes.
                </TableCell>
              </TableRow>
            ) : (
              annees.map((a) => (
                <TableRow key={a.id} className={a.id === annee?.id ? 'bg-muted/40' : undefined}>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">
                      {a.label}
                      {a.is_current && <Badge variant="secondary">en cours</Badge>}
                      {a.id === annee?.id && !a.is_current && (
                        <Badge variant="outline">consultée</Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {a.start_date && a.end_date ? `${a.start_date} → ${a.end_date}` : '—'}
                  </TableCell>
                  <TableCell>{a.classes_count}</TableCell>
                  <TableCell>{a.eleves_count}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPromotion(a)}
                        disabled={a.eleves_count === 0}
                        title={
                          a.eleves_count === 0
                            ? 'Aucun élève à faire passer'
                            : 'Faire passer les élèves dans une autre année'
                        }
                      >
                        <ArrowUpRight className="size-4" />
                        Passage de classe
                      </Button>
                      {!a.is_current && (
                        <Button variant="outline" size="sm" onClick={() => basculer(a)}>
                          <CheckCircle2 className="size-4" />
                          Définir en cours
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AnneeFormDialog open={formOpen} onOpenChange={setFormOpen} />
      <PromotionDialog
        key={promotion?.id ?? 'aucune'}
        open={Boolean(promotion)}
        onOpenChange={(v) => !v && setPromotion(null)}
        anneeSource={promotion}
        annees={annees}
      />
    </div>
  )
}
