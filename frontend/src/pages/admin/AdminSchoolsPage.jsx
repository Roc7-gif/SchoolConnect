import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
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
import { getApiErrorMessage } from '@/lib/api'
import { fetchSchools, updateSchool } from '@/lib/admin-api'

import EditSchoolDialog from './EditSchoolDialog'

export default function AdminSchoolsPage() {
  const queryClient = useQueryClient()
  const [editingSchool, setEditingSchool] = useState(null)

  const { data: schools = [], isLoading } = useQuery({
    queryKey: ['admin-schools'],
    queryFn: fetchSchools,
  })

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }) => updateSchool(id, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-schools'] })
    },
    onError: (error) => toast.error(getApiErrorMessage(error, "Impossible de mettre à jour l'école")),
  })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-semibold">Écoles clientes</h2>
        <p className="text-sm text-muted-foreground">
          Vue AfriLab sur l'ensemble des établissements de la plateforme.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Ville</TableHead>
              <TableHead>Pays</TableHead>
              <TableHead className="text-right">Élèves</TableHead>
              <TableHead className="text-right">Parents</TableHead>
              <TableHead className="text-right">Messages</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8">
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ) : schools.length ? (
              schools.map((school) => (
                <TableRow key={school.id}>
                  <TableCell className="font-medium">{school.name}</TableCell>
                  <TableCell className="text-muted-foreground">{school.city || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{school.country}</TableCell>
                  <TableCell className="text-right">{school.eleves_count ?? '—'}</TableCell>
                  <TableCell className="text-right">{school.parents_count ?? '—'}</TableCell>
                  <TableCell className="text-right">{school.messages_count ?? '—'}</TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() =>
                        toggleActiveMutation.mutate({ id: school.id, is_active: !school.is_active })
                      }
                    >
                      <Badge
                        className={school.is_active ? 'bg-success-600 text-neutral-0' : ''}
                        variant={school.is_active ? undefined : 'secondary'}
                      >
                        {school.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </button>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => setEditingSchool(school)}>
                      <Pencil className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  Aucune école enregistrée.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <EditSchoolDialog
        school={editingSchool}
        onOpenChange={(open) => !open && setEditingSchool(null)}
      />
    </div>
  )
}
