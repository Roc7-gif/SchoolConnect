import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { useAnnee } from '@/lib/annee'
import { createClasse, updateClasse } from '@/lib/schools-api'

const classeSchema = z.object({
  name: z.string().min(1, 'Nom requis'),
  level: z.string().optional(),
})

export default function ClasseFormDialog({ open, onOpenChange, classe }) {
  const queryClient = useQueryClient()
  const { annee } = useAnnee()
  const isEditing = Boolean(classe)

  const form = useForm({
    resolver: zodResolver(classeSchema),
    defaultValues: { name: '', level: '' },
  })

  useEffect(() => {
    if (open) {
      form.reset({
        name: classe?.name ?? '',
        level: classe?.level ?? '',
      })
    }
  }, [open, classe, form])

  const mutation = useMutation({
    mutationFn: (values) =>
      // L'année n'est plus saisie : une classe appartient à l'année consultée.
      isEditing ? updateClasse(classe.id, values) : createClasse({ ...values, annee: annee?.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classes'] })
      toast.success(isEditing ? 'Classe mise à jour' : 'Classe créée')
      onOpenChange(false)
    },
    onError: () => {
      toast.error("Une erreur est survenue")
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Modifier la classe' : 'Nouvelle classe'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nom de la classe</FormLabel>
                  <FormControl>
                    <Input placeholder="ex: CM2 A" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="level"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Niveau</FormLabel>
                  <FormControl>
                    <Input placeholder="ex: CM2" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {annee && (
              <p className="text-sm text-muted-foreground">
                Année scolaire : <span className="font-medium">{annee.label}</span>
              </p>
            )}
            <DialogFooter>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
