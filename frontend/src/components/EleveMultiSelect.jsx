import SearchMultiSelect from '@/components/SearchMultiSelect'
import { useAnnee } from '@/lib/annee'
import { fetchEleves } from '@/lib/schools-api'

/** Sélection d'élèves avec recherche — utilisé par les formulaires parent et message.
 *  Ne propose que les élèves inscrits sur l'année consultée. */
export default function EleveMultiSelect({
  value,
  onChange,
  disabledIds,
  disabledLabel = 'déjà rattaché',
  enabled = true,
  placeholder = 'Rechercher un élève par nom, prénom ou matricule...',
}) {
  const { anneeId } = useAnnee()

  return (
    <SearchMultiSelect
      value={value}
      onChange={onChange}
      queryKey={['eleves', null, anneeId]}
      queryFn={(search) => fetchEleves(null, search, anneeId)}
      getLabel={(e) => `${e.last_name} ${e.first_name}`}
      getHint={(e) => e.classe_name}
      disabledIds={disabledIds}
      disabledLabel={disabledLabel}
      enabled={enabled}
      placeholder={placeholder}
      emptyLabel="Aucun élève"
    />
  )
}
