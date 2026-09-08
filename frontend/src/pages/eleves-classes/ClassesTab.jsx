import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
import SearchInput from '@/components/SearchInput'
import { useAnnee } from '@/lib/annee'
import { deleteClasse, fetchClasses } from '@/lib/schools-api'

import ClasseFormDialog from './ClasseFormDialog'

export default function ClassesTab() {
  const queryClient = useQueryClient()
  const { anneeId } = useAnnee()
  const [dialog, setDialog] = useState({ open: false, classe: null })
  const [toDelete, setToDelete] = useState(null)
  const [search, setSearch] = useState('')

  const { data: classes = [], isLoading } = useQuery({
    queryKey: ['classes', search, anneeId],
    queryFn: () => fetchClasses(search, anneeId),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteClasse,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classes'] })
      queryClient.invalidateQueries({ queryKey: ['eleves'] })
      toast.success('Classe supprimée')
      setToDelete(null)
    },
    onError: () => toast.error('Impossible de supprimer la classe'),
  })

  return (
    <div className="space-y-4">
      <SearchInput
        onChange={setSearch}
        placeholder="Rechercher une classe par nom, niveau ou année..."
        className="max-w-md"
      />

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {classes.length} classe(s) — supprimer une classe ne supprime pas ses élèves, ils
          repassent en « sans classe ».
        </p>
        <Button onClick={() => setDialog({ open: true, classe: null })}>
          <Plus className="size-4" />
          Nouvelle classe
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Niveau</TableHead>
              <TableHead>Année scolaire</TableHead>
              <TableHead>Élèves</TableHead>
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
            ) : classes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  {search ? `Aucune classe ne correspond à « ${search} »` : 'Aucune classe pour le moment'}
                </TableCell>
              </TableRow>
            ) : (
              classes.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{c.level || '—'}</TableCell>
                  <TableCell>{c.annee_label || '—'}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{c.eleves_count}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setDialog({ open: true, classe: c })}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => setToDelete(c)}>
                        <Trash2 className="size-4 text-error-600" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ClasseFormDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog({ open, classe: open ? dialog.classe : null })}
        classe={dialog.classe}
      />

      <AlertDialog open={Boolean(toDelete)} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la classe « {toDelete?.name} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete?.eleves_count
                ? `Ses ${toDelete.eleves_count} élève(s) ne seront pas supprimés mais se retrouveront sans classe.`
                : 'Cette action est irréversible.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-error-600 hover:bg-error-700"
              onClick={() => deleteMutation.mutate(toDelete.id)}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
