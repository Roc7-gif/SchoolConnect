import { useQuery } from '@tanstack/react-query'

import { Badge } from '@/components/ui/badge'
import { fetchMessageVariables } from '@/lib/messaging-api'

const GROUP_LABELS = {
  eleve: 'Élève',
  parent: 'Parent',
  ecole: 'École',
}

/**
 * Variables insérables dans un corps de message, servies par l'API — donc incluant les
 * colonnes personnalisées créées à l'import, que le frontend ne peut pas deviner.
 *
 * `onInsert` reçoit le jeton prêt à coller (`{eleve_nom}`).
 */
export default function VariablePicker({ onInsert }) {
  const { data: variables = [] } = useQuery({
    queryKey: ['message-variables'],
    queryFn: fetchMessageVariables,
    staleTime: 5 * 60 * 1000,
  })

  if (!variables.length) return null

  const groups = ['eleve', 'parent', 'ecole']
    .map((group) => [group, variables.filter((v) => v.group === group)])
    .filter(([, entries]) => entries.length > 0)

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Cliquez pour insérer. Les variables « Élève » personnalisent le message enfant par
        enfant — un parent de plusieurs enfants concernés le reçoit alors une fois par enfant.
      </p>
      {groups.map(([group, entries]) => (
        <div key={group} className="flex flex-wrap items-center gap-1">
          <span className="w-14 shrink-0 text-xs text-muted-foreground">
            {GROUP_LABELS[group]}
          </span>
          {entries.map((v) => (
            <Badge
              key={v.name}
              variant="secondary"
              title={v.label}
              className="cursor-pointer font-normal hover:bg-primary-100"
              onClick={() => onInsert(`{${v.name}}`)}
            >
              {`{${v.name}}`}
            </Badge>
          ))}
        </div>
      ))}
    </div>
  )
}
