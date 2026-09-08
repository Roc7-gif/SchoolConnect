import { AlertTriangle, Users } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CHANNEL_LABELS, SCOPE_LABELS } from '@/lib/messaging-labels'

function Stat({ label, value, hint }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-display font-semibold">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/**
 * Récapitulatif renvoyé par /api/messages/preview/ : ce que l'envoi produira
 * exactement, avant de le déclencher.
 */
export default function MessagePreview({ preview, payload, classes }) {
  const scopeLabel = SCOPE_LABELS[payload.scope_type] || payload.scope_type
  const classeName = classes.find((c) => c.id === payload.scope_classe)?.name
  const channelLabel =
    payload.channel === 'CASCADE' && payload.channel_order?.length
      ? payload.channel_order.map((c) => CHANNEL_LABELS[c] || c).join(' → ')
      : CHANNEL_LABELS[payload.channel] || payload.channel

  return (
    <div className="space-y-4">
      {/* Le texte réellement reçu, variables substituées — pas le gabarit : c'est la
          seule façon de voir qu'une donnée manque avant que le message ne parte. */}
      <div className="rounded-md border border-border bg-muted/40 p-3">
        <p className="text-xs text-muted-foreground">
          {preview.sample_rendered ? 'Exemple reçu par le premier destinataire' : 'Message'}
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm">
          {preview.sample_rendered || payload.body}
        </p>
      </div>

      {preview.variable_warnings?.length > 0 && (
        <div className="flex gap-2 rounded-md border border-amber-500 bg-amber-50 p-3 text-sm">
          <AlertTriangle className="size-4 shrink-0 text-amber-600" />
          <div className="space-y-1">
            {preview.variable_warnings.map((w) => (
              <p key={w.variable}>
                <code>{`{${w.variable}}`}</code>{' '}
                {w.unknown ? (
                  <>n'existe pas — elle sera remplacée par du vide.</>
                ) : (
                  <>
                    est vide pour <strong>{w.missing_count}</strong> destinataire(s) sur{' '}
                    {preview.messages_count}.
                  </>
                )}
              </p>
            ))}
          </div>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Destinataires</dt>
        <dd>
          {scopeLabel}
          {classeName ? ` — ${classeName}` : ''}
          {payload.scope_type === 'NIVEAU' && payload.scope_level ? ` — ${payload.scope_level}` : ''}
          {payload.scope_type === 'INDIVIDUEL' ? ` — ${payload.scope_eleves.length} élève(s)` : ''}
        </dd>
        <dt className="text-muted-foreground">Canaux</dt>
        <dd>{channelLabel}</dd>
        <dt className="text-muted-foreground">Par élève</dt>
        <dd>
          {preview.notify_all_parents
            ? 'Tous les parents rattachés'
            : 'Contact prioritaire uniquement'}
        </dd>
      </dl>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Élèves concernés" value={preview.eleves_count} />
        <Stat
          label="Messages envoyés"
          value={preview.messages_count}
          hint={preview.unreachable ? `dont ${preview.unreachable} en échec` : null}
        />
        <Stat label="Coût estimé" value={`${preview.cost} FCFA`} />
      </div>

      {preview.deduplicated && preview.eleves_count > preview.messages_count && (
        <div className="flex gap-2 rounded-md border border-primary-600 bg-primary-50 p-3 text-sm">
          <Users className="size-4 shrink-0 text-primary-700" />
          <p>
            Votre message ne cite aucune donnée propre à l'élève : un parent ayant plusieurs
            enfants concernés ne le reçoit qu'<strong>une fois</strong>. Ajoutez une variable
            comme{' '}
            {(preview.student_variables ?? ['eleve_nom', 'classe'])
              .slice(0, 3)
              .map((v) => (
                <code key={v} className="mr-1">{`{${v}}`}</code>
              ))}
            pour qu'il parte une fois par enfant.
          </p>
        </div>
      )}

      {preview.by_channel.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {preview.by_channel.map((c) => (
            <Badge key={c.channel} variant="secondary">
              {CHANNEL_LABELS[c.channel] || c.channel} : {c.count}
            </Badge>
          ))}
        </div>
      )}

      {preview.by_classe.length > 0 && (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Classe</TableHead>
                <TableHead className="text-right">Élèves</TableHead>
                <TableHead className="text-right">Messages</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.by_classe.map((row) => (
                <TableRow key={row.classe}>
                  <TableCell>{row.classe}</TableCell>
                  <TableCell className="text-right">{row.eleves}</TableCell>
                  <TableCell className="text-right">{row.messages}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {preview.failures.length > 0 && (
        <div className="rounded-md border border-accent-500 bg-accent-100 p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-neutral-950">
            <AlertTriangle className="size-4" />
            {preview.unreachable} élève(s) ne seront pas joints
          </p>
          <ul className="mt-2 space-y-1 text-sm text-neutral-800">
            {preview.failures.map((f, i) => (
              <li key={i}>
                • {f.eleve} ({f.classe}) — {f.reason}
              </li>
            ))}
          </ul>
          {preview.failures_truncated && (
            <p className="mt-2 text-xs text-neutral-700">… et d'autres, non listés ici.</p>
          )}
        </div>
      )}
    </div>
  )
}
