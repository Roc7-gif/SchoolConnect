import SearchMultiSelect from '@/components/SearchMultiSelect'
import { fetchParents } from '@/lib/parents-api'

/** Sélection de parents avec recherche — utilisé pour rattacher depuis la fiche élève. */
export default function ParentMultiSelect({
  value,
  onChange,
  disabledIds,
  disabledLabel = 'déjà rattaché',
  enabled = true,
  placeholder = 'Rechercher un parent par nom, téléphone ou email...',
}) {
  return (
    <SearchMultiSelect
      value={value}
      onChange={onChange}
      queryKey={['parents']}
      queryFn={(search) => fetchParents(search)}
      getLabel={(p) => `${p.last_name} ${p.first_name}`}
      getHint={(p) => p.phone_number}
      disabledIds={disabledIds}
      disabledLabel={disabledLabel}
      enabled={enabled}
      placeholder={placeholder}
      emptyLabel="Aucun parent"
    />
  )
}
