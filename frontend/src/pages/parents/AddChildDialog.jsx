import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import EleveMultiSelect from '@/components/EleveMultiSelect'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createStudentGuardian } from '@/lib/parents-api'

const schema = z.object({
  eleves: z.array(z.number()).min(1, 'Sélectionnez au moins un élève'),
  relationship: z.string().min(1),
  is_primary_contact: z.boolean().optional(),
})

const DEFAULTS = { eleves: [], relationship: 'TUTEUR', is_primary_contact: false }

export default function AddChildDialog({ open, onOpenChange, parent }) {
  const queryClient = useQueryClient()

  const form = useForm({ resolver: zodResolver(schema), defaultValues: DEFAULTS })
  const selected = form.watch('eleves')

  useEffect(() => {
    if (open) form.reset(DEFAULTS)
  }, [open, form])

  // Les enfants déjà rattachés restent visibles mais non cochables : l'unicité
  // (student, parent) est garantie en base, autant l'expliquer que d'échouer.
  const linkedIds = useMemo(
    () => new Set((parent?.students ?? []).map((sg) => sg.student)),
    [parent],
  )

  const mutation = useMutation({
    mutationFn: (values) =>
      Promise.all(
        values.eleves.map((id) =>
          createStudentGuardian({
            student: id,
            parent: parent.id,
            relationship: values.relationship,
            is_primary_contact: values.is_primary_contact,
          }),
        ),
      ),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['parents'] })
      toast.success(`${created.length} enfant(s) rattaché(s)`)
      onOpenChange(false)
    },
    onError: () => toast.error('Une erreur est survenue'),
  })

  if (!parent) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Ajouter des enfants à {parent.first_name} {parent.last_name}
          </DialogTitle>
          <DialogDescription>
            Cherchez par nom, prénom ou matricule — une faute de frappe est tolérée. Vous pouvez en
            sélectionner plusieurs d'un coup.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="eleves"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Élèves ({selected.length} sélectionné(s))</FormLabel>
                  <EleveMultiSelect
                    value={field.value}
                    onChange={(next) => field.onChange(next)}
                    disabledIds={linkedIds}
                    enabled={open}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4 items-end">
              <FormField
                control={form.control}
                name="relationship"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Relation</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="MERE">Mère</SelectItem>
                        <SelectItem value="PERE">Père</SelectItem>
                        <SelectItem value="TUTEUR">Tuteur/Tutrice</SelectItem>
                        <SelectItem value="AUTRE">Autre</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="is_primary_contact"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 pb-2">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="!mt-0">Contact prioritaire</FormLabel>
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Ajout...' : `Ajouter (${selected.length})`}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
