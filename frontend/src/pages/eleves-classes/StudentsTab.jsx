import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Star, Table2, Trash2, UserPlus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import SearchInput from '@/components/SearchInput'
import { cn } from '@/lib/utils'
import { useAnnee } from '@/lib/annee'
import { deleteStudentGuardian } from '@/lib/parents-api'
import {
  bulkDeleteEleves,
  bulkUpdateEleves,
  deleteEleve,
  fetchClasses,
  fetchCustomFields,
  fetchEleves,
  SANS_CLASSE,
} from '@/lib/schools-api'
import { handlePasteFill } from '@/lib/use-paste-fill'

import AddParentDialog from './AddParentDialog'
import EleveFormDialog from './EleveFormDialog'

const NONE_VALUE = '__none__'

const RELATIONSHIP_LABELS = {
  MERE: 'Mère',
  PERE: 'Père',
  TUTEUR: 'Tuteur/Tutrice',
  AUTRE: 'Autre',
}

const EDITABLE_COLUMNS = [
  { key: 'last_name', label: 'Nom' },
  { key: 'first_name', label: 'Prénom' },
  { key: 'sexe', label: 'Sexe', type: 'sexe' },
  { key: 'date_of_birth', label: 'Naissance', placeholder: 'AAAA-MM-JJ' },
  { key: 'matricule', label: 'Matricule' },
]

export default function StudentsTab() {
  const queryClient = useQueryClient()
  const { anneeId } = useAnnee()
  const [selectedClasseId, setSelectedClasseId] = useState(null)
  const [eleveDialog, setEleveDialog] = useState({ open: false, eleve: null })
  const [eleveToDelete, setEleveToDelete] = useState(null)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [parentDialog, setParentDialog] = useState({ open: false, eleve: null })
  const [linkToDelete, setLinkToDelete] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [editing, setEditing] = useState(false)
  const [drafts, setDrafts] = useState({})
  const [search, setSearch] = useState('')

  const { data: classes = [], isLoading: loadingClasses } = useQuery({
    queryKey: ['classes', anneeId],
    queryFn: () => fetchClasses(undefined, anneeId),
  })

  const { data: eleves = [], isLoading: loadingEleves } = useQuery({
    queryKey: ['eleves', selectedClasseId, search, anneeId],
    queryFn: () => fetchEleves(selectedClasseId, search, anneeId),
  })

  const { data: customFields = [] } = useQuery({
    queryKey: ['custom-fields'],
    queryFn: fetchCustomFields,
  })

  function resetEdition() {
    setDrafts({})
    setEditing(false)
  }

  function afterMutation() {
    queryClient.invalidateQueries({ queryKey: ['eleves'] })
    queryClient.invalidateQueries({ queryKey: ['classes'] })
  }

  const deleteMutation = useMutation({
    mutationFn: deleteEleve,
    onSuccess: () => {
      afterMutation()
      toast.success('Élève supprimé')
      setEleveToDelete(null)
    },
    onError: () => toast.error("Impossible de supprimer l'élève"),
  })

  const unlinkParentMutation = useMutation({
    mutationFn: (linkId) => deleteStudentGuardian(linkId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eleves'] })
      queryClient.invalidateQueries({ queryKey: ['parents'] })
      toast.success('Parent détaché')
      setLinkToDelete(null)
    },
    onError: () => toast.error('Impossible de détacher ce parent'),
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: () => bulkDeleteEleves(selectedIds),
    onSuccess: () => {
      afterMutation()
      toast.success(`${selectedIds.length} élève(s) supprimé(s)`)
      setSelectedIds([])
      setConfirmBulkDelete(false)
    },
    onError: () => toast.error('La suppression par lot a échoué'),
  })

  const saveMutation = useMutation({
    mutationFn: () => bulkUpdateEleves(buildUpdates()),
    onSuccess: (data) => {
      afterMutation()
      toast.success(`${data.updated.length} élève(s) mis à jour`)
      resetEdition()
    },
    onError: (error) => {
      const errors = error?.response?.data?.errors
      toast.error(
        errors
          ? `${Object.keys(errors).length} ligne(s) refusée(s) — vérifiez les valeurs saisies`
          : "L'enregistrement a échoué",
      )
    },
  })

  function buildUpdates() {
    return Object.entries(drafts).map(([id, patch]) => {
      const payload = { id: Number(id), ...patch }
      if ('date_of_birth' in payload && !payload.date_of_birth) payload.date_of_birth = null
      if ('classe' in payload && !payload.classe) payload.classe = null
      return payload
    })
  }

  function rowValue(eleve, key) {
    const patch = drafts[eleve.id]
    return patch && key in patch ? patch[key] : eleve[key]
  }

  function extraValue(eleve, slug) {
    const patch = drafts[eleve.id]
    const extra = patch?.extra_data ?? eleve.extra_data
    return extra?.[slug] ?? ''
  }

  function setCell(id, key, value) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }))
  }

  function setExtraCell(id, slug, value) {
    setDrafts((prev) => {
      const patch = prev[id] ?? {}
      const base = patch.extra_data ?? eleves.find((e) => e.id === id)?.extra_data ?? {}
      return { ...prev, [id]: { ...patch, extra_data: { ...base, [slug]: value } } }
    })
  }

  // Colonnes atteignables par un collage Excel (la classe est un Select, exclue).
  const pasteableColumns = useMemo(
    () => [...EDITABLE_COLUMNS.map((c) => c.key), ...customFields.map((f) => f.slug)],
    [customFields],
  )
  const editableKeys = useMemo(() => new Set(EDITABLE_COLUMNS.map((c) => c.key)), [])
  const rowIds = useMemo(() => eleves.map((e) => e.id), [eleves])

  function applyPastedCell(id, columnKey, value) {
    if (editableKeys.has(columnKey)) {
      setCell(id, columnKey, value)
    } else {
      setExtraCell(id, columnKey, value)
    }
  }

  const allSelected = eleves.length > 0 && selectedIds.length === eleves.length

  function toggleAll(checked) {
    setSelectedIds(checked ? rowIds : [])
  }

  function toggleOne(id, checked) {
    setSelectedIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)))
  }

  const dirtyCount = Object.keys(drafts).length
  // sélection + colonnes éditables + classe + champs personnalisés + parents + statut + actions
  const columnCount = EDITABLE_COLUMNS.length + customFields.length + 5

  return (
    <div className="space-y-4">
      <SearchInput
        onChange={setSearch}
        placeholder="Rechercher un élève par nom, prénom ou matricule..."
        className="max-w-md"
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedClasseId(null)}
            className={cn(
              'rounded-full px-3 py-1 text-sm border transition-colors',
              selectedClasseId === null
                ? 'bg-primary-600 text-neutral-0 border-primary-600'
                : 'border-border hover:bg-muted',
            )}
          >
            Toutes les classes
          </button>
          <button
            type="button"
            onClick={() => setSelectedClasseId(SANS_CLASSE)}
            className={cn(
              'rounded-full px-3 py-1 text-sm border transition-colors',
              selectedClasseId === SANS_CLASSE
                ? 'bg-primary-600 text-neutral-0 border-primary-600'
                : 'border-border hover:bg-muted',
            )}
          >
            Sans classe
          </button>
          {loadingClasses && <Skeleton className="h-7 w-24 rounded-full" />}
          {classes.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedClasseId(c.id)}
              className={cn(
                'rounded-full px-3 py-1 text-sm border transition-colors',
                selectedClasseId === c.id
                  ? 'bg-primary-600 text-neutral-0 border-primary-600'
                  : 'border-border hover:bg-muted',
              )}
            >
              {c.name}
              <span className="ml-1 opacity-70">({c.eleves_count})</span>
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          {editing ? (
            <>
              <Button variant="outline" onClick={resetEdition} disabled={saveMutation.isPending}>
                <X className="size-4" />
                Annuler
              </Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={dirtyCount === 0 || saveMutation.isPending}
              >
                {saveMutation.isPending
                  ? 'Enregistrement...'
                  : `Enregistrer (${dirtyCount} ligne${dirtyCount > 1 ? 's' : ''})`}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setEditing(true)} disabled={eleves.length === 0}>
                <Table2 className="size-4" />
                Édition tableur
              </Button>
              <Button onClick={() => setEleveDialog({ open: true, eleve: null })}>
                <Plus className="size-4" />
                Nouvel élève
              </Button>
            </>
          )}
        </div>
      </div>

      {editing && (
        <p className="text-sm text-muted-foreground">
          Modifiez les cellules directement — vous pouvez coller un bloc de cellules depuis Excel,
          il se répartit sur les lignes et colonnes suivantes.
        </p>
      )}

      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted px-4 py-2">
          <span className="text-sm">{selectedIds.length} élève(s) sélectionné(s)</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>
              Tout désélectionner
            </Button>
            <Button
              size="sm"
              className="bg-error-600 hover:bg-error-700"
              onClick={() => setConfirmBulkDelete(true)}
            >
              <Trash2 className="size-4" />
              Supprimer la sélection
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Tout sélectionner"
                />
              </TableHead>
              {EDITABLE_COLUMNS.map((col) => (
                <TableHead key={col.key} className="whitespace-nowrap">
                  {col.label}
                </TableHead>
              ))}
              <TableHead className="whitespace-nowrap">Classe</TableHead>
              {customFields.map((f) => (
                <TableHead key={f.slug} className="whitespace-nowrap">
                  {f.name}
                </TableHead>
              ))}
              <TableHead className="whitespace-nowrap">Parents</TableHead>
              <TableHead className="whitespace-nowrap">Statut</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingEleves ? (
              <TableRow>
                <TableCell colSpan={columnCount}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ) : eleves.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columnCount} className="text-center text-muted-foreground py-8">
                  {search ? `Aucun élève ne correspond à « ${search} »` : 'Aucun élève pour le moment'}
                </TableCell>
              </TableRow>
            ) : (
              eleves.map((eleve, rowPos) => (
                <TableRow key={eleve.id} data-state={selectedIds.includes(eleve.id) ? 'selected' : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.includes(eleve.id)}
                      onCheckedChange={(v) => toggleOne(eleve.id, Boolean(v))}
                      aria-label={`Sélectionner ${eleve.last_name} ${eleve.first_name}`}
                    />
                  </TableCell>

                  {EDITABLE_COLUMNS.map((col, colIdx) => (
                    <TableCell key={col.key} className={editing ? 'p-1' : undefined}>
                      {!editing ? (
                        rowValue(eleve, col.key) || '—'
                      ) : col.type === 'sexe' ? (
                        <Select
                          value={rowValue(eleve, 'sexe') || NONE_VALUE}
                          onValueChange={(v) => setCell(eleve.id, 'sexe', v === NONE_VALUE ? '' : v)}
                        >
                          <SelectTrigger className="h-8 w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE_VALUE}>—</SelectItem>
                            <SelectItem value="M">M</SelectItem>
                            <SelectItem value="F">F</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          value={rowValue(eleve, col.key) ?? ''}
                          placeholder={col.placeholder}
                          onChange={(e) => setCell(eleve.id, col.key, e.target.value)}
                          onPaste={(e) =>
                            handlePasteFill({
                              event: e,
                              rows: rowIds,
                              columns: pasteableColumns,
                              rowIndex: rowPos,
                              colIndex: colIdx,
                              applyCell: applyPastedCell,
                            })
                          }
                          className="h-8 min-w-28 border-transparent hover:border-input focus:border-input"
                        />
                      )}
                    </TableCell>
                  ))}

                  <TableCell className={editing ? 'p-1' : undefined}>
                    {editing ? (
                      <Select
                        value={rowValue(eleve, 'classe') ? String(rowValue(eleve, 'classe')) : NONE_VALUE}
                        onValueChange={(v) =>
                          setCell(eleve.id, 'classe', v === NONE_VALUE ? null : Number(v))
                        }
                      >
                        <SelectTrigger className="h-8 w-36">
                          <SelectValue placeholder="Aucune" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE_VALUE}>Aucune</SelectItem>
                          {classes.map((c) => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      eleve.classe_name || '—'
                    )}
                  </TableCell>

                  {customFields.map((f, customIdx) => (
                    <TableCell key={f.slug} className={editing ? 'p-1' : undefined}>
                      {editing ? (
                        <Input
                          value={extraValue(eleve, f.slug)}
                          onChange={(e) => setExtraCell(eleve.id, f.slug, e.target.value)}
                          onPaste={(e) =>
                            handlePasteFill({
                              event: e,
                              rows: rowIds,
                              columns: pasteableColumns,
                              rowIndex: rowPos,
                              colIndex: EDITABLE_COLUMNS.length + customIdx,
                              applyCell: applyPastedCell,
                            })
                          }
                          className="h-8 min-w-28 border-transparent hover:border-input focus:border-input"
                        />
                      ) : (
                        extraValue(eleve, f.slug) || '—'
                      )}
                    </TableCell>
                  ))}

                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      {(eleve.parents ?? []).map((link) => (
                        <Badge
                          key={link.id}
                          variant="secondary"
                          className="gap-1"
                          title={`${RELATIONSHIP_LABELS[link.relationship] || link.relationship} — ${link.phone_number}`}
                        >
                          {link.is_primary_contact && <Star className="size-3 fill-current" />}
                          {link.parent_name}
                          <button
                            type="button"
                            onClick={() => setLinkToDelete({ link, eleve })}
                            className="hover:text-error-600"
                            aria-label={`Retirer ${link.parent_name}`}
                          >
                            <X className="size-3" />
                          </button>
                        </Badge>
                      ))}
                      <button
                        type="button"
                        onClick={() => setParentDialog({ open: true, eleve })}
                        className="flex items-center gap-1 rounded-full border border-dashed border-border px-2 text-xs text-muted-foreground hover:bg-muted"
                      >
                        <UserPlus className="size-3" />
                        Ajouter
                      </button>
                    </div>
                  </TableCell>

                  <TableCell>
                    {eleve.is_active ? (
                      <Badge className="bg-success-600 text-neutral-0">Actif</Badge>
                    ) : (
                      <Badge variant="secondary">Inactif</Badge>
                    )}
                  </TableCell>

                  <TableCell>
                    {!editing && (
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setEleveDialog({ open: true, eleve })}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => setEleveToDelete(eleve)}>
                          <Trash2 className="size-4 text-error-600" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AddParentDialog
        open={parentDialog.open}
        onOpenChange={(open) => setParentDialog({ open, eleve: open ? parentDialog.eleve : null })}
        eleve={parentDialog.eleve}
      />

      <AlertDialog open={Boolean(linkToDelete)} onOpenChange={(open) => !open && setLinkToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Détacher ce parent ?</AlertDialogTitle>
            <AlertDialogDescription>
              {linkToDelete &&
                `${linkToDelete.link.parent_name} ne sera plus rattaché à ${linkToDelete.eleve.last_name} ${linkToDelete.eleve.first_name} et ne recevra plus les messages le concernant. Le parent lui-même n'est pas supprimé.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-error-600 hover:bg-error-700"
              onClick={() => unlinkParentMutation.mutate(linkToDelete.link.id)}
            >
              Détacher
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EleveFormDialog
        open={eleveDialog.open}
        onOpenChange={(open) => setEleveDialog({ open, eleve: open ? eleveDialog.eleve : null })}
        eleve={eleveDialog.eleve}
        defaultClasseId={selectedClasseId === SANS_CLASSE ? null : selectedClasseId}
      />

      <AlertDialog open={Boolean(eleveToDelete)} onOpenChange={(open) => !open && setEleveToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cet élève ?</AlertDialogTitle>
            <AlertDialogDescription>
              {eleveToDelete && `${eleveToDelete.first_name} ${eleveToDelete.last_name}`} sera
              définitivement supprimé. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-error-600 hover:bg-error-700"
              onClick={() => deleteMutation.mutate(eleveToDelete.id)}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer {selectedIds.length} élève(s) ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les élèves sélectionnés seront définitivement supprimés, ainsi que leur rattachement
              aux parents. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-error-600 hover:bg-error-700"
              onClick={() => bulkDeleteMutation.mutate()}
              disabled={bulkDeleteMutation.isPending}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
