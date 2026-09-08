import { useQuery } from '@tanstack/react-query'
import { FileText, Send } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { fetchMessages } from '@/lib/messaging-api'
import { CHANNEL_LABELS, SCOPE_LABELS, STATUS_LABELS, STATUS_STYLES } from '@/lib/messaging-labels'

import ComposeMessageDialog from './messages/ComposeMessageDialog'
import TemplatesManagerDialog from './messages/TemplatesManagerDialog'

export default function MessagesPage() {
  const navigate = useNavigate()
  const [composeOpen, setComposeOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['messages'],
    queryFn: fetchMessages,
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-semibold">Messages</h2>
          <p className="text-muted-foreground text-sm">
            Composez et envoyez des messages aux parents
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setTemplatesOpen(true)}>
            <FileText className="size-4" />
            Modèles
          </Button>
          <Button onClick={() => setComposeOpen(true)}>
            <Send className="size-4" />
            Nouveau message
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Portée</TableHead>
              <TableHead>Canal</TableHead>
              <TableHead>Destinataires</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Coût</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ) : messages.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Aucun message envoyé pour le moment
                </TableCell>
              </TableRow>
            ) : (
              messages.map((m) => (
                <TableRow
                  key={m.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/messages/${m.id}`)}
                >
                  <TableCell>
                    {m.sent_at ? new Date(m.sent_at).toLocaleString('fr-FR') : '—'}
                  </TableCell>
                  <TableCell>
                    {SCOPE_LABELS[m.scope_type]}
                    {m.scope_classe_name ? ` (${m.scope_classe_name})` : ''}
                    {m.scope_type === 'NIVEAU' && m.scope_level ? ` (${m.scope_level})` : ''}
                  </TableCell>
                  <TableCell>{CHANNEL_LABELS[m.channel] || m.channel}</TableCell>
                  <TableCell>{m.recipient_count}</TableCell>
                  <TableCell>
                    <Badge className={STATUS_STYLES[m.status]} variant={m.status === 'BROUILLON' ? 'secondary' : undefined}>
                      {STATUS_LABELS[m.status] || m.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{m.cost} FCFA</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ComposeMessageDialog open={composeOpen} onOpenChange={setComposeOpen} />
      <TemplatesManagerDialog open={templatesOpen} onOpenChange={setTemplatesOpen} />
    </div>
  )
}
