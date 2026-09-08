import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { useAnnee } from '@/lib/annee'

const schema = z.object({
  // 9 caractères max côté modèle : le format « 2025-2026 » en fait exactement 9.
  label: z
    .string()
    .min(1, 'Libellé requis')
    .max(9, '9 caractères maximum (ex : 2025-2026)'),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
})

/** Suggère l'année suivant la plus récente déjà enregistrée, sinon l'année civile en cours. */
function prochainLabel(annees) {
  const debuts = annees
    .map((a) => Number.parseInt(a.label.slice(0, 4), 10))
    .filter((n) => !Number.isNaN(n))
  const debut = debuts.length ? Math.max(...debuts) + 1 : new Date().getFullYear()
  return `${debut}-${debut + 1}`
}

export default function AnneeFormDialog({ open, onOpenChange }) {
  const { annees, creerAnnee } = useAnnee()

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { label: '', start_date: '', end_date: '' },
  })

  useEffect(() => {
    if (open) {
      form.reset({ label: prochainLabel(annees), start_date: '', end_date: '' })
    }
  }, [open, annees, form])

  async function onSubmit(values) {
    try {
      await creerAnnee({
        label: values.label,
        start_date: values.start_date || null,
        end_date: values.end_date || null,
      })
      toast.success(`Année ${values.label} créée`)
      onOpenChange(false)
    } catch (err) {
      const detail = err?.response?.data
      toast.error(detail?.label?.[0] || "Impossible de créer l'année scolaire")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle année scolaire</DialogTitle>
          <DialogDescription>
            Elle démarre vide. Vous y créerez des classes, ou ferez monter les élèves de
            l'année précédente avec le passage en classe supérieure.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Libellé</FormLabel>
                  <FormControl>
                    <Input placeholder="ex : 2026-2027" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Début (optionnel)</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fin (optionnel)</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Création...' : 'Créer'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
