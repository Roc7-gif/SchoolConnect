import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { fetchBillingSummary } from '@/lib/billing-api'
import {
  CHANNEL_LABELS,
  SCOPE_LABELS,
  STATUS_LABELS,
  STATUS_STYLES,
} from '@/lib/messaging-labels'

const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

/** « 2026-07 » → « juillet 2026 ». */
function formatMois(valeur) {
  const [annee, mois] = (valeur || '').split('-')
  const index = Number(mois) - 1
  return MOIS[index] ? `${MOIS[index]} ${annee}` : valeur
}

function formatFcfa(montant) {
  return `${Number(montant ?? 0).toLocaleString('fr-FR')} FCFA`
}

export default function BillingPage() {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['billing-summary'],
    queryFn: fetchBillingSummary,
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-display font-semibold">Facturation</h2>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const mois = data?.current_month
  const tarifs = (data?.tarifs ?? [])
    .map((t) => `${CHANNEL_LABELS[t.channel] || t.channel} ${formatFcfa(t.cost)}`)
    .join(' · ')

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-semibold">Facturation</h2>
        <p className="text-sm text-muted-foreground">
          Consommation réelle de votre établissement. Seuls les messages effectivement
          remis sont facturés — un destinataire injoignable ne coûte rien, et seul le canal
          qui a abouti est compté.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Mois en cours — {formatMois(mois?.label)}</CardDescription>
            <CardTitle className="text-3xl">{formatFcfa(mois?.cost)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {mois?.messages_count ?? 0} message(s) remis
            </p>
          </CardContent>
        </Card>

        <Card className="sm:col-span-2">
          <CardHeader>
            <CardDescription>Répartition par canal ce mois-ci</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {mois?.by_channel?.length ? (
              mois.by_channel.map((c) => (
                <div key={c.channel} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Badge variant="secondary">{CHANNEL_LABELS[c.channel] || c.channel}</Badge>
                    <span className="text-muted-foreground">{c.count} envoi(s)</span>
                  </span>
                  <span className="font-medium">{formatFcfa(c.cost)}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Aucun envoi ce mois-ci.</p>
            )}
            {tarifs && (
              <p className="border-t border-border pt-2 text-xs text-muted-foreground">
                Tarifs appliqués : {tarifs}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="mb-2 text-lg font-display font-semibold">Historique mensuel</h3>
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mois</TableHead>
                <TableHead>Messages remis</TableHead>
                <TableHead className="text-right">Coût</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.months?.length ? (
                data.months.map((m) => (
                  <TableRow key={m.month}>
                    <TableCell className="font-medium">{formatMois(m.month)}</TableCell>
                    <TableCell>{m.messages_count}</TableCell>
                    <TableCell className="text-right">{formatFcfa(m.cost)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                    Aucun envoi enregistré pour le moment.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-lg font-display font-semibold">Détail par envoi</h3>
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Portée</TableHead>
                <TableHead>Année</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead>Destinataires</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Coût</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.recent_messages?.length ? (
                data.recent_messages.map((m) => (
                  <TableRow
                    key={m.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/messages/${m.id}`)}
                  >
                    <TableCell>
                      {m.sent_at ? new Date(m.sent_at).toLocaleString('fr-FR') : '—'}
                    </TableCell>
                    <TableCell>{SCOPE_LABELS[m.scope_type] || m.scope_type}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.annee_label || '—'}
                    </TableCell>
                    <TableCell>{CHANNEL_LABELS[m.channel] || m.channel}</TableCell>
                    <TableCell>{m.recipient_count}</TableCell>
                    <TableCell>
                      <Badge
                        className={STATUS_STYLES[m.status]}
                        variant={m.status === 'BROUILLON' ? 'secondary' : undefined}
                      >
                        {STATUS_LABELS[m.status] || m.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatFcfa(m.cost)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    Aucun message envoyé pour le moment.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
