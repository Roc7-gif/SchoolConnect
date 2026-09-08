import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
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
import { useAnnee } from '@/lib/annee'
import { createEleve, fetchClasses, fetchCustomFields, updateEleve } from '@/lib/schools-api'

const NONE_VALUE = '__none__'

const eleveSchema = z.object({
  first_name: z.string().min(1, 'Prénom requis'),
  last_name: z.string().min(1, 'Nom requis'),
  sexe: z.string().optional(),
  date_of_birth: z.string().optional(),
  matricule: z.string().optional(),
  classe: z.string().optional(),
})

export default function EleveFormDialog({ open, onOpenChange, eleve, defaultClasseId }) {
  const queryClient = useQueryClient()
  const { anneeId } = useAnnee()
  const isEditing = Boolean(eleve)

  const { data: classes = [] } = useQuery({
    queryKey: ['classes', anneeId],
    queryFn: () => fetchClasses(undefined, anneeId),
  })
  const { data: customFields = [] } = useQuery({
    queryKey: ['custom-fields'],
    queryFn: fetchCustomFields,
    enabled: open,
  })
  const [extra, setExtra] = useState({})

  const form = useForm({
    resolver: zodResolver(eleveSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      sexe: '',
      date_of_birth: '',
      matricule: '',
      classe: '',
    },
  })

  useEffect(() => {
    if (open) {
      form.reset({
        first_name: eleve?.first_name ?? '',
        last_name: eleve?.last_name ?? '',
        sexe: eleve?.sexe ?? '',
        date_of_birth: eleve?.date_of_birth ?? '',
        matricule: eleve?.matricule ?? '',
        classe: eleve?.classe ? String(eleve.classe) : defaultClasseId ? String(defaultClasseId) : '',
      })
      setExtra(eleve?.extra_data ?? {})
    }
  }, [open, eleve, defaultClasseId, form])

  const mutation = useMutation({
    mutationFn: (values) => {
      const payload = {
        ...values,
        classe: values.classe ? Number(values.classe) : null,
        date_of_birth: values.date_of_birth || null,
        extra_data: extra,
      }
      return isEditing ? updateEleve(eleve.id, payload) : createEleve(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eleves'] })
      queryClient.invalidateQueries({ queryKey: ['classes'] })
      toast.success(isEditing ? 'Élève mis à jour' : 'Élève ajouté')
      onOpenChange(false)
    },
    onError: () => {
      toast.error('Une erreur est survenue')
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Modifier l'élève" : 'Nouvel élève'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="first_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prénom</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="last_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nom</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="classe"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Classe</FormLabel>
                  <Select
                    value={field.value || NONE_VALUE}
                    onValueChange={(v) => field.onChange(v === NONE_VALUE ? '' : v)}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Aucune classe" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NONE_VALUE}>Aucune classe</SelectItem>
                      {classes.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="sexe"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sexe</FormLabel>
                    <Select
                      value={field.value || NONE_VALUE}
                      onValueChange={(v) => field.onChange(v === NONE_VALUE ? '' : v)}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Non renseigné" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE_VALUE}>Non renseigné</SelectItem>
                        <SelectItem value="M">Masculin</SelectItem>
                        <SelectItem value="F">Féminin</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="date_of_birth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date de naissance</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="matricule"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Matricule</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {customFields.length > 0 && (
              <div className="space-y-3 rounded-md border border-border p-3">
                <p className="text-sm font-medium">Champs personnalisés</p>
                <div className="grid grid-cols-2 gap-4">
                  {customFields.map((f) => (
                    <div key={f.slug} className="space-y-1.5">
                      <label className="text-sm font-medium">{f.name}</label>
                      <Input
                        value={extra[f.slug] ?? ''}
                        onChange={(e) => setExtra((prev) => ({ ...prev, [f.slug]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
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
