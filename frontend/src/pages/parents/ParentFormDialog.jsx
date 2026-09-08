import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import EleveMultiSelect from '@/components/EleveMultiSelect'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { getApiErrorMessage } from '@/lib/api'
import { createParent, createStudentGuardian, updateParent } from '@/lib/parents-api'

const PHONE_REGEX = /^\+[1-9]\d{6,14}$/
const PHONE_FORMAT_MESSAGE = 'Format international requis, ex: +2250700000000'

const baseSchema = {
  first_name: z.string().min(1, 'Prénom requis'),
  last_name: z.string().min(1, 'Nom requis'),
  phone_number: z.string().min(1, 'Téléphone requis').regex(PHONE_REGEX, PHONE_FORMAT_MESSAGE),
  whatsapp_number: z
    .string()
    .optional()
    .refine((v) => !v || PHONE_REGEX.test(v), PHONE_FORMAT_MESSAGE),
  email: z.string().optional(),
  preferred_channel: z.string().min(1),
}

const createSchema = z.object({
  ...baseSchema,
  eleves: z.array(z.number()).min(1, 'Sélectionnez au moins un élève'),
  relationship: z.string().min(1),
  is_primary_contact: z.boolean().optional(),
})

const editSchema = z.object(baseSchema)

export default function ParentFormDialog({ open, onOpenChange, parent }) {
  const queryClient = useQueryClient()
  const isEditing = Boolean(parent)

  const form = useForm({
    resolver: zodResolver(isEditing ? editSchema : createSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      phone_number: '',
      whatsapp_number: '',
      email: '',
      preferred_channel: 'SMS',
      eleves: [],
      relationship: 'TUTEUR',
      is_primary_contact: true,
    },
  })

  useEffect(() => {
    if (open) {
      form.reset({
        first_name: parent?.first_name ?? '',
        last_name: parent?.last_name ?? '',
        phone_number: parent?.phone_number ?? '',
        whatsapp_number: parent?.whatsapp_number ?? '',
        email: parent?.email ?? '',
        preferred_channel: parent?.preferred_channel ?? 'SMS',
        eleves: [],
        relationship: 'TUTEUR',
        is_primary_contact: true,
      })
    }
  }, [open, parent, form])

  const mutation = useMutation({
    mutationFn: async (values) => {
      if (isEditing) {
        return updateParent(parent.id, values)
      }
      const newParent = await createParent({
        first_name: values.first_name,
        last_name: values.last_name,
        phone_number: values.phone_number,
        whatsapp_number: values.whatsapp_number,
        email: values.email,
        preferred_channel: values.preferred_channel,
      })
      await Promise.all(
        values.eleves.map((id) =>
          createStudentGuardian({
            student: id,
            parent: newParent.id,
            relationship: values.relationship,
            is_primary_contact: values.is_primary_contact,
          }),
        ),
      )
      return newParent
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parents'] })
      toast.success(isEditing ? 'Parent mis à jour' : 'Parent ajouté')
      onOpenChange(false)
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Modifier le parent' : 'Nouveau parent'}</DialogTitle>
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

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="phone_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Téléphone</FormLabel>
                    <FormControl>
                      <Input placeholder="+2250700000000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="preferred_channel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Canal préféré</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="SMS">SMS</SelectItem>
                        <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                        <SelectItem value="EMAIL">Email</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="whatsapp_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>WhatsApp (si différent)</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {!isEditing && (
              <>
                <FormField
                  control={form.control}
                  name="eleves"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Enfants à rattacher ({field.value.length} sélectionné(s))</FormLabel>
                      <EleveMultiSelect
                        value={field.value}
                        onChange={(next) => field.onChange(next)}
                        enabled={open && !isEditing}
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
              </>
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
