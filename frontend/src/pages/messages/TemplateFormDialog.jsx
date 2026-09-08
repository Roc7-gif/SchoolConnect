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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import VariablePicker from '@/components/VariablePicker'
import { createTemplate, updateTemplate } from '@/lib/messaging-api'

const CATEGORIES = [
  { value: 'RESULTATS', label: 'Résultats' },
  { value: 'ABSENCE', label: 'Absence' },
  { value: 'PAIEMENT', label: 'Paiement' },
  { value: 'REUNION', label: 'Réunion' },
  { value: 'CONVOCATION', label: 'Convocation' },
  { value: 'AUTRE', label: 'Autre' },
]

const schema = z.object({
  name: z.string().min(1, 'Nom requis'),
  category: z.string().min(1),
  subject: z.string().optional(),
  body: z.string().min(1, 'Contenu requis'),
})

export default function TemplateFormDialog({ open, onOpenChange, template }) {
  const queryClient = useQueryClient()
  const isEditing = Boolean(template)

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: '', category: 'AUTRE', subject: '', body: '' },
  })

  useEffect(() => {
    if (open) {
      form.reset({
        name: template?.name ?? '',
        category: template?.category ?? 'AUTRE',
        subject: template?.subject ?? '',
        body: template?.body ?? '',
      })
    }
  }, [open, template, form])

  const mutation = useMutation({
    mutationFn: (values) =>
      isEditing ? updateTemplate(template.id, values) : createTemplate(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-templates'] })
      toast.success(isEditing ? 'Modèle mis à jour' : 'Modèle créé')
      onOpenChange(false)
    },
    onError: () => toast.error('Une erreur est survenue'),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Modifier le modèle' : 'Nouveau modèle'}</DialogTitle>
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
                  <FormLabel>Nom du modèle</FormLabel>
                  <FormControl>
                    <Input placeholder="ex: Résultats trimestriels" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Catégorie</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="subject"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Objet (email uniquement)</FormLabel>
                  <FormControl>
                    <Input placeholder="Vide = nom de l'école" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="body"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contenu</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={5}
                      placeholder="Bonjour {parent_nom}, ..."
                      {...field}
                    />
                  </FormControl>
                  <VariablePicker
                    onInsert={(token) => field.onChange(`${field.value || ''}${token}`)}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
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
