import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useMemo, useState } from 'react'
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
import { useAnnee } from '@/lib/annee'
import { fetchClasses } from '@/lib/schools-api'
import { fetchTemplates, previewMessage, sendMessageAndWait } from '@/lib/messaging-api'
import { CHANNEL_LABELS, DEFAULT_CASCADE, toChannelOrder } from '@/lib/messaging-labels'

import CascadeOrderField from './CascadeOrderField'
import MessagePreview from './MessagePreview'

const NONE_VALUE = '__none__'

const composeSchema = z
  .object({
    template: z.string().optional(),
    subject: z.string().optional(),
    body: z.string().min(1, 'Message requis'),
    scope_type: z.string().min(1),
    scope_classe: z.string().optional(),
    scope_level: z.string().optional(),
    scope_eleves: z.array(z.number()).optional(),
    channel: z.string().min(1),
    cascade: z.array(z.object({ channel: z.string(), enabled: z.boolean() })),
    notify_all_parents: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.channel === 'CASCADE' && !data.cascade.some((c) => c.enabled)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cascade'], message: 'Cochez au moins un canal' })
    }
    if (data.scope_type === 'CLASSE' && !data.scope_classe) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scope_classe'], message: 'Sélectionnez une classe' })
    }
    if (data.scope_type === 'NIVEAU' && !data.scope_level) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scope_level'], message: 'Sélectionnez un niveau' })
    }
    if (data.scope_type === 'INDIVIDUEL' && (!data.scope_eleves || data.scope_eleves.length === 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scope_eleves'], message: 'Sélectionnez au moins un élève' })
    }
  })

export default function ComposeMessageDialog({ open, onOpenChange }) {
  const queryClient = useQueryClient()
  const { annee } = useAnnee()
  // Non nul = on est à l'étape de vérification : { preview, payload }.
  const [preview, setPreview] = useState(null)

  const { data: templates = [] } = useQuery({
    queryKey: ['message-templates'],
    queryFn: fetchTemplates,
    enabled: open,
  })
  const { data: classes = [] } = useQuery({
    queryKey: ['classes', annee?.id],
    queryFn: () => fetchClasses(undefined, annee?.id),
    enabled: open,
  })

  const levels = useMemo(
    () => [...new Set(classes.map((c) => c.level).filter(Boolean))],
    [classes],
  )

  const form = useForm({
    resolver: zodResolver(composeSchema),
    defaultValues: {
      template: '',
      subject: '',
      body: '',
      scope_type: 'ECOLE',
      scope_classe: '',
      scope_level: '',
      scope_eleves: [],
      channel: 'CASCADE',
      cascade: DEFAULT_CASCADE,
      notify_all_parents: false,
    },
  })

  const scopeType = form.watch('scope_type')
  const channel = form.watch('channel')
  const cascadeSummary = toChannelOrder(form.watch('cascade') || [])
    .map((c) => CHANNEL_LABELS[c])
    .join(', puis ')

  function buildPayload(values) {
    return {
      // L'année ciblée part avec le message : c'est elle qui borne les destinataires,
      // pour qu'un envoi « école entière » ne touche pas les familles d'anciens élèves.
      annee: annee?.id ?? null,
      template: values.template ? Number(values.template) : null,
      subject: values.subject,
      body: values.body,
      scope_type: values.scope_type,
      scope_classe: values.scope_type === 'CLASSE' ? Number(values.scope_classe) : null,
      scope_level: values.scope_type === 'NIVEAU' ? values.scope_level : '',
      scope_eleves: values.scope_type === 'INDIVIDUEL' ? values.scope_eleves : [],
      channel: values.channel,
      channel_order: values.channel === 'CASCADE' ? toChannelOrder(values.cascade) : [],
      notify_all_parents: values.notify_all_parents,
    }
  }

  const previewMutation = useMutation({
    mutationFn: (values) => {
      const payload = buildPayload(values)
      return previewMessage(payload).then((data) => ({ preview: data, payload }))
    },
    onSuccess: setPreview,
    onError: () => toast.error("Impossible de calculer l'aperçu"),
  })

  const mutation = useMutation({
    mutationFn: () => sendMessageAndWait(preview.payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['messages'] })
      if (data.status === 'BROUILLON') {
        toast.info("L'envoi est toujours en cours de traitement — vérifiez l'historique dans un instant.")
      } else if (data.status === 'ENVOYE') {
        toast.success(`Message envoyé à ${data.recipient_count} destinataire(s) — ${data.cost} FCFA`)
      } else {
        toast.error("L'envoi a échoué.")
      }
      handleClose(false)
    },
    onError: () => toast.error("Une erreur est survenue lors de l'envoi"),
  })

  function handleClose(next) {
    if (!next) {
      setPreview(null)
      form.reset()
    }
    onOpenChange(next)
  }

  function handleTemplateChange(templateId) {
    form.setValue('template', templateId)
    const tpl = templates.find((t) => String(t.id) === templateId)
    if (tpl) {
      form.setValue('body', tpl.body)
      form.setValue('subject', tpl.subject || '')
    }
  }

  if (preview) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Vérifier avant d'envoyer</DialogTitle>
            <DialogDescription>
              Rien n'a encore été envoyé. Vérifiez les destinataires, les canaux et le coût.
            </DialogDescription>
          </DialogHeader>

          <MessagePreview preview={preview.preview} payload={preview.payload} classes={classes} />

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)} disabled={mutation.isPending}>
              <ArrowLeft className="size-4" />
              Modifier
            </Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || preview.preview.messages_count === 0}
            >
              {mutation.isPending
                ? 'Envoi...'
                : `Envoyer ${preview.preview.messages_count} message(s) — ${preview.preview.cost} FCFA`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouveau message</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => previewMutation.mutate(values))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="template"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Modèle (optionnel)</FormLabel>
                  <Select
                    value={field.value || NONE_VALUE}
                    onValueChange={(v) => handleTemplateChange(v === NONE_VALUE ? '' : v)}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Message libre" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NONE_VALUE}>Message libre</SelectItem>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="scope_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Destinataires</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="ECOLE">Toute l'école</SelectItem>
                      <SelectItem value="CLASSE">Une classe</SelectItem>
                      <SelectItem value="NIVEAU">Un niveau</SelectItem>
                      <SelectItem value="INDIVIDUEL">Élève(s) spécifique(s)</SelectItem>
                    </SelectContent>
                  </Select>
                  {annee && (
                    <p className="text-xs text-muted-foreground">
                      Seuls les élèves inscrits en{' '}
                      <span className="font-medium">{annee.label}</span> seront contactés.
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {scopeType === 'CLASSE' && (
              <FormField
                control={form.control}
                name="scope_classe"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Classe</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Sélectionner une classe" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
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
            )}

            {scopeType === 'NIVEAU' && (
              <FormField
                control={form.control}
                name="scope_level"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Niveau</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Sélectionner un niveau" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {levels.map((lvl) => (
                          <SelectItem key={lvl} value={lvl}>
                            {lvl}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {scopeType === 'INDIVIDUEL' && (
              <FormField
                control={form.control}
                name="scope_eleves"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Élèves ({field.value.length} sélectionné(s))</FormLabel>
                    <EleveMultiSelect
                      value={field.value}
                      onChange={(next) => field.onChange(next)}
                      enabled={open}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

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
                  <FormLabel>Message</FormLabel>
                  <FormControl>
                    <Textarea rows={5} {...field} />
                  </FormControl>
                  <VariablePicker
                    onInsert={(token) => field.onChange(`${field.value || ''}${token}`)}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="channel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Canal</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="CASCADE">Cascade : SMS, puis WhatsApp, puis Email</SelectItem>
                      <SelectItem value="AUTO">Automatique (canal préféré du parent)</SelectItem>
                      <SelectItem value="SMS">SMS</SelectItem>
                      <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                      <SelectItem value="EMAIL">Email</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {channel === 'CASCADE' && (
              <FormField
                control={form.control}
                name="cascade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ordre de priorité</FormLabel>
                    <CascadeOrderField value={field.value} onChange={field.onChange} />
                    <p className="text-xs text-muted-foreground">
                      {cascadeSummary
                        ? `Chaque parent est contacté par ${cascadeSummary}. On passe au canal suivant si le précédent échoue ou si le parent n'a pas la coordonnée. Seul le canal qui aboutit est facturé.`
                        : 'Cochez au moins un canal.'}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="notify_all_parents"
              render={({ field }) => (
                <FormItem className="rounded-md border border-border p-3">
                  <div className="flex items-center gap-2">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="!mt-0">Prévenir tous les parents de chaque élève</FormLabel>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {field.value
                      ? 'Chaque parent rattaché recevra le message — le coût est multiplié par le nombre de parents.'
                      : "Seul le contact prioritaire de chaque élève est contacté (à défaut, le premier parent joignable)."}
                  </p>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={previewMutation.isPending}>
                {previewMutation.isPending ? 'Calcul...' : "Vérifier avant d'envoyer"}
                <ArrowRight className="size-4" />
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
