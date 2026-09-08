import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAnnee } from '@/lib/annee'
import { fetchBillingSummary } from '@/lib/billing-api'
import { CHANNEL_LABELS, SCOPE_LABELS, STATUS_LABELS, STATUS_STYLES } from '@/lib/messaging-labels'
import { fetchClasses, fetchEleves } from '@/lib/schools-api'
import { fetchParents } from '@/lib/parents-api'

function formatFcfa(montant) {
  return `${Number(montant ?? 0).toLocaleString('fr-FR')} FCFA`
}

export default function DashboardPage() {
  const { anneeId } = useAnnee()
  const navigate = useNavigate()

  const { data: classes, isLoading: loadingClasses } = useQuery({
    queryKey: ['classes', anneeId],
    queryFn: () => fetchClasses(undefined, anneeId),
  })
  const { data: eleves, isLoading: loadingEleves } = useQuery({
    queryKey: ['eleves', null, anneeId],
    queryFn: () => fetchEleves(null, undefined, anneeId),
  })
  const { data: parents, isLoading: loadingParents } = useQuery({
    queryKey: ['parents'],
    queryFn: fetchParents,
  })
  const { data: billing, isLoading: loadingBilling } = useQuery({
    queryKey: ['billing-summary'],
    queryFn: fetchBillingSummary,
  })

  const stats = [
    { label: 'Classes', value: classes?.length, loading: loadingClasses },
    { label: 'Élèves', value: eleves?.length, loading: loadingEleves },
    { label: 'Parents', value: parents?.length, loading: loadingParents },
  ]

  const mois = billing?.current_month
  const recentMessages = (billing?.recent_messages ?? []).slice(0, 5)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-semibold">Tableau de bord</h2>
        <p className="text-muted-foreground text-sm">Vue d'ensemble de votre établissement</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader>
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className="text-3xl">
                {s.loading ? <Skeleton className="h-8 w-16" /> : s.value ?? 0}
              </CardTitle>
            </CardHeader>
            <CardContent />
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardDescription>Messages remis ce mois</CardDescription>
            <CardTitle className="text-3xl">
              {loadingBilling ? <Skeleton className="h-8 w-16" /> : mois?.messages_count ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent />
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Coût ce mois</CardDescription>
            <CardTitle className="text-3xl">
              {loadingBilling ? <Skeleton className="h-8 w-24" /> : formatFcfa(mois?.cost)}
            </CardTitle>
          </CardHeader>
          <CardContent />
        </Card>
      </div>

      <div>
        <h3 className="mb-2 text-lg font-display font-semibold">Activité récente</h3>
        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          {loadingBilling ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
            </div>
          ) : recentMessages.length ? (
            recentMessages.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => navigate(`/messages/${m.id}`)}
                className="flex w-full items-center justify-between px-4 py-3 text-sm text-left hover:bg-muted/50"
              >
                <span className="flex items-center gap-2">
                  <Badge variant="secondary">{CHANNEL_LABELS[m.channel] || m.channel}</Badge>
                  <span>{SCOPE_LABELS[m.scope_type] || m.scope_type}</span>
                  <span className="text-muted-foreground">
                    {m.recipient_count} destinataire(s)
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-muted-foreground">
                    {m.sent_at ? new Date(m.sent_at).toLocaleDateString('fr-FR') : '—'}
                  </span>
                  <Badge
                    className={STATUS_STYLES[m.status]}
                    variant={m.status === 'BROUILLON' ? 'secondary' : undefined}
                  >
                    {STATUS_LABELS[m.status] || m.status}
                  </Badge>
                </span>
              </button>
            ))
          ) : (
            <p className="p-4 text-sm text-muted-foreground">Aucun message envoyé pour le moment.</p>
          )}
        </div>
      </div>
    </div>
  )
}
