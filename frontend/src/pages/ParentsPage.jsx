import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2, UserPlus, X } from 'lucide-react'
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
import { deleteParent, deleteStudentGuardian, fetchParents } from '@/lib/parents-api'

import AddChildDialog from './parents/AddChildDialog'
import ParentFormDialog from './parents/ParentFormDialog'

const CHANNEL_LABELS = { SMS: 'SMS', WHATSAPP: 'WhatsApp', EMAIL: 'Email' }

export default function ParentsPage() {
  const queryClient = useQueryClient()
  const [parentDialog, setParentDialog] = useState({ open: false, parent: null })
  const [addChildDialog, setAddChildDialog] = useState({ open: false, parent: null })
  const [parentToDelete, setParentToDelete] = useState(null)
  const [search, setSearch] = useState('')

  const { data: parents = [], isLoading } = useQuery({
    queryKey: ['parents', search],
    queryFn: () => fetchParents(search),
  })

  const deleteParentMutation = useMutation({
    mutationFn: deleteParent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parents'] })
      toast.success('Parent supprimé')
      setParentToDelete(null)
    },
    onError: () => toast.error('Impossible de supprimer ce parent'),
  })

  const unlinkMutation = useMutation({
    mutationFn: deleteStudentGuardian,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parents'] })
      toast.success('Lien retiré')
    },
    onError: () => toast.error('Une erreur est survenue'),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-semibold">Parents</h2>
          <p className="text-muted-foreground text-sm">
            Gérez les parents et tuteurs et leurs liens avec les élèves
          </p>
        </div>
        <Button onClick={() => setParentDialog({ open: true, parent: null })}>
          <Plus className="size-4" />
          Nouveau parent
        </Button>
      </div>

      <SearchInput
        onChange={setSearch}
        placeholder="Rechercher un parent par nom, téléphone, email ou nom d'enfant..."
        className="max-w-md"
      />

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Téléphone</TableHead>
              <TableHead>Canal préféré</TableHead>
              <TableHead>Enfants</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ) : parents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  {search ? `Aucun parent ne correspond à « ${search} »` : 'Aucun parent pour le moment'}
                </TableCell>
              </TableRow>
            ) : (
              parents.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.last_name} {p.first_name}</TableCell>
                  <TableCell>{p.phone_number}</TableCell>
                  <TableCell>{CHANNEL_LABELS[p.preferred_channel] || p.preferred_channel}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {p.students.length === 0 && (
                        <span className="text-muted-foreground text-sm">Aucun</span>
                      )}
                      {p.students.map((sg) => (
                        <Badge key={sg.id} variant="secondary" className="gap-1">
                          {sg.student_name}
                          <button
                            type="button"
                            onClick={() => unlinkMutation.mutate(sg.id)}
                            className="hover:text-error-600"
                          >
                            <X className="size-3" />
                          </button>
                        </Badge>
                      ))}
                      <button
                        type="button"
                        onClick={() => setAddChildDialog({ open: true, parent: p })}
                        className="rounded-full border border-dashed border-border px-2 text-xs text-muted-foreground hover:bg-muted flex items-center gap-1"
                      >
                        <UserPlus className="size-3" />
                        Ajouter
                      </button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setParentDialog({ open: true, parent: p })}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => setParentToDelete(p)}>
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

      <ParentFormDialog
        open={parentDialog.open}
        onOpenChange={(open) => setParentDialog({ open, parent: open ? parentDialog.parent : null })}
        parent={parentDialog.parent}
      />

      <AddChildDialog
        open={addChildDialog.open}
        onOpenChange={(open) => setAddChildDialog({ open, parent: open ? addChildDialog.parent : null })}
        parent={addChildDialog.parent}
      />

      <AlertDialog open={Boolean(parentToDelete)} onOpenChange={(open) => !open && setParentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce parent ?</AlertDialogTitle>
            <AlertDialogDescription>
              {parentToDelete && `${parentToDelete.first_name} ${parentToDelete.last_name}`} sera
              définitivement supprimé, ainsi que ses liens avec les élèves. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-error-600 hover:bg-error-700"
              onClick={() => deleteParentMutation.mutate(parentToDelete.id)}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
