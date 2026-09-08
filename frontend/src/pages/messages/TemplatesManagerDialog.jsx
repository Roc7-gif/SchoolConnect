import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { deleteTemplate, fetchTemplates } from '@/lib/messaging-api'

import TemplateFormDialog from './TemplateFormDialog'

export default function TemplatesManagerDialog({ open, onOpenChange }) {
  const queryClient = useQueryClient()
  const [formDialog, setFormDialog] = useState({ open: false, template: null })

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['message-templates'],
    queryFn: fetchTemplates,
    enabled: open,
  })

  const deleteMutation = useMutation({
    mutationFn: deleteTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-templates'] })
      toast.success('Modèle supprimé')
    },
    onError: () => toast.error('Une erreur est survenue'),
  })

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader className="flex-row items-center justify-between">
            <DialogTitle>Modèles de messages</DialogTitle>
          </DialogHeader>

          <div className="flex justify-end">
            <Button size="sm" onClick={() => setFormDialog({ open: true, template: null })}>
              <Plus className="size-4" />
              Nouveau modèle
            </Button>
          </div>

          <div className="space-y-2 max-h-96 overflow-auto">
            {isLoading && <Skeleton className="h-16 w-full" />}
            {!isLoading && templates.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                Aucun modèle pour le moment
              </p>
            )}
            {templates.map((t) => (
              <div
                key={t.id}
                className="rounded-md border border-border p-3 flex items-start justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{t.name}</span>
                    <Badge variant="secondary">{t.category}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">{t.body}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setFormDialog({ open: true, template: t })}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => deleteMutation.mutate(t.id)}
                  >
                    <Trash2 className="size-4 text-error-600" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <TemplateFormDialog
        open={formDialog.open}
        onOpenChange={(o) => setFormDialog({ open: o, template: o ? formDialog.template : null })}
        template={formDialog.template}
      />
    </>
  )
}
