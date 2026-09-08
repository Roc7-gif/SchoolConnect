import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { fetchMessage, resendMessage } from '@/lib/messaging-api'
import { CHANNEL_LABELS, SCOPE_LABELS, STATUS_LABELS, STATUS_STYLES } from '@/lib/messaging-labels'

function StatusBadge({ status }) {
  return (
    <Badge className={STATUS_STYLES[status]} variant={status === 'BROUILLON' ? 'secondary' : undefined}>
      {STATUS_LABELS[status] || status}
    </Badge>
  )
}

export default function MessageDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: message, isLoading } = useQuery({
    queryKey: ['message', id],
    queryFn: () => fetchMessage(id),
  })

  const resend = useMutation({
    mutationFn: () => resendMessage(id),
    onSuccess: (retry) => {
      queryClient.invalidateQueries({ queryKey: ['message', id] })
      queryClient.invalidateQueries({ queryKey: ['messages'] })
      toast.success(`Renvoi créé vers ${retry.recipient_count} élève(s) encore injoignable(s)`)
    },
    onError: (error) => {
      const detail = error?.response?.data?.detail
      toast.error(detail || "Le renvoi a échoué")
    },
  })

  if (isLoading || !message) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  const recipients = message.recipients || []
  const reached = recipients.filter((r) => r.status === 'ENVOYE')
  const unreached = recipients.filter((r) => r.status !== 'ENVOYE')
  const canResend = ['PARTIEL', 'ECHEC'].includes(message.status) && unreached.some((r) => r.eleve)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/messages')}>
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h2 className="text-2xl font-display font-semibold">Détail de l'envoi</h2>
          {message.retry_of && (
            <p className="text-muted-foreground text-sm">
              Renvoi de{' '}
              <Link to={`/messages/${message.retry_of}`} className="underline">
                ce message
              </Link>
            </p>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>
                {SCOPE_LABELS[message.scope_type]}
                {message.scope_classe_name ? ` (${message.scope_classe_name})` : ''}
                {message.scope_type === 'NIVEAU' && message.scope_level ? ` (${message.scope_level})` : ''}
              </CardTitle>
              <CardDescription>
                {message.sent_at ? new Date(message.sent_at).toLocaleString('fr-FR') : 'Non envoyé'} ·{' '}
                {message.channel === 'CASCADE' && message.channel_order?.length
                  ? message.channel_order.map((c) => CHANNEL_LABELS[c] || c).join(' → ')
                  : CHANNEL_LABELS[message.channel] || message.channel}{' '}
                · {message.cost} FCFA
              </CardDescription>
            </div>
            <StatusBadge status={message.status} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="whitespace-pre-wrap text-sm">{message.body}</p>

          {canResend && (
            <Button onClick={() => resend.mutate()} disabled={resend.isPending}>
              <RotateCcw className="size-4" />
              {resend.isPending ? 'Renvoi en cours...' : `Renvoyer aux non-reçus (${unreached.length})`}
            </Button>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="unreached">
        <TabsList>
          <TabsTrigger value="unreached">Non reçu ({unreached.length})</TabsTrigger>
          <TabsTrigger value="reached">Reçu ({reached.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="unreached">
          <RecipientTable rows={unreached} showReason templateBody={message.body} />
        </TabsContent>
        <TabsContent value="reached">
          <RecipientTable rows={reached} templateBody={message.body} />
        </TabsContent>
      </Tabs>

      {message.retries && message.retries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Renvois</CardTitle>
            <CardDescription>Historique des tentatives liées à cet envoi</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Destinataires</TableHead>
                  <TableHead>Coût</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {message.retries.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/messages/${r.id}`)}
                  >
                    <TableCell>
                      {r.sent_at ? new Date(r.sent_at).toLocaleString('fr-FR') : '—'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell>{r.recipient_count}</TableCell>
                    <TableCell>{r.cost} FCFA</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

const NO_CLASSE = '__none__'

/** Regroupe les destinataires par classe, « Sans classe » en dernier. */
function groupByClasse(rows) {
  const groups = new Map()
  for (const row of rows) {
    const key = row.eleve_classe ?? NO_CLASSE
    if (!groups.has(key)) {
      groups.set(key, { key, label: row.eleve_classe_name || 'Sans classe', rows: [] })
    }
    groups.get(key).rows.push(row)
  }
  return [...groups.values()].sort((a, b) => {
    if (a.key === NO_CLASSE) return 1
    if (b.key === NO_CLASSE) return -1
    return a.label.localeCompare(b.label, 'fr')
  })
}

/** Parcours de la cascade : SMS ✗ → WhatsApp ✓. */
function AttemptTrail({ attempts }) {
  if (!attempts || attempts.length <= 1) return null
  return (
    <div className="text-xs text-muted-foreground">
      {attempts.map((a, i) => (
        <span key={i}>
          {i > 0 && ' → '}
          <span title={a.error || undefined}>
            {CHANNEL_LABELS[a.channel] || a.channel} {a.status === 'ENVOYE' ? '✓' : '✗'}
          </span>
        </span>
      ))}
    </div>
  )
}

function RecipientTable({ rows, showReason, templateBody }) {
  const groups = groupByClasse(rows)

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card px-4 py-8 text-center text-muted-foreground">
        Aucun destinataire dans cette catégorie
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.key} className="rounded-lg border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2">
            <h3 className="font-display font-semibold">
              {group.key === NO_CLASSE ? (
                <span className="text-secondary-600">{group.label}</span>
              ) : (
                group.label
              )}
            </h3>
            <Badge variant="secondary">{group.rows.length}</Badge>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Élève</TableHead>
                <TableHead>Parent</TableHead>
                <TableHead>Canal</TableHead>
                {showReason && <TableHead>Raison</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    {r.eleve_name || '—'}
                    {r.eleves_count > 1 && (
                      <span
                        className="ml-1 text-xs text-muted-foreground"
                        title="Le message ne cite aucun élève : ce parent l'a reçu une seule fois pour tous ses enfants concernés."
                      >
                        +{r.eleves_count - 1} autre(s) enfant(s)
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {r.parent_name || '—'}
                    {/* Texte réellement reçu : il diffère du gabarit dès que le message
                        porte des variables, et c'est lui qui fait foi. */}
                    {r.rendered_body && r.rendered_body !== templateBody && (
                      <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                        {r.rendered_body}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    {CHANNEL_LABELS[r.channel_used] || r.channel_used || '—'}
                    <AttemptTrail attempts={r.attempts} />
                  </TableCell>
                  {showReason && (
                    <TableCell>
                      {r.skip_reason_display && r.skip_reason ? (
                        <Badge variant="secondary">{r.skip_reason_display}</Badge>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ))}
    </div>
  )
}
