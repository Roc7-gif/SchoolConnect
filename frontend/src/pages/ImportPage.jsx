import { useMutation, useQuery } from '@tanstack/react-query'
import { Download, Plus, Trash2 } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  commitImport,
  downloadImportTemplate,
  fetchImportColumns,
  previewImport,
  previewImportAI,
} from '@/lib/import-api'
import { useAnnee } from '@/lib/annee'
import { createCustomField, fetchClasses, fetchCustomFields } from '@/lib/schools-api'
import { handlePasteFill } from '@/lib/use-paste-fill'

const FIXED_COLUMNS = [
  { key: 'first_name', label: 'Prénom' },
  { key: 'last_name', label: 'Nom' },
  { key: 'sexe', label: 'Sexe' },
  { key: 'date_of_birth', label: 'Naissance' },
  { key: 'matricule', label: 'Matricule' },
  { key: 'parent_first_name', label: 'Parent prénom' },
  { key: 'parent_last_name', label: 'Parent nom' },
  { key: 'parent_phone', label: 'Téléphone parent' },
]
const FIXED_KEYS = new Set(FIXED_COLUMNS.map((c) => c.key))

const NONE_GROUP = '__none__'

export default function ImportPage() {
  const { annee, anneeId } = useAnnee()
  const [plan, setPlan] = useState(null)
  const [mode, setMode] = useState('DETERMINISTE')
  const [customColumns, setCustomColumns] = useState([])
  const [addingColumn, setAddingColumn] = useState(false)
  const [newColumnName, setNewColumnName] = useState('')

  const { data: columns } = useQuery({ queryKey: ['import-columns'], queryFn: fetchImportColumns })
  const { data: existingClasses = [] } = useQuery({
    queryKey: ['classes', anneeId],
    queryFn: () => fetchClasses(undefined, anneeId),
  })
  const { data: existingCustomFields = [] } = useQuery({
    queryKey: ['custom-fields'],
    queryFn: fetchCustomFields,
  })

  const addColumnMutation = useMutation({
    mutationFn: (name) => createCustomField(name),
    onSuccess: (field) => {
      setCustomColumns((prev) =>
        prev.some((c) => c.slug === field.slug) ? prev : [...prev, field],
      )
      setPlan((prev) => ({
        ...prev,
        rows: prev.rows.map((r) => ({
          ...r,
          extra: { ...r.extra, [field.slug]: r.extra?.[field.slug] ?? '' },
        })),
      }))
      setAddingColumn(false)
      setNewColumnName('')
    },
    onError: () => toast.error("Impossible de créer cette colonne"),
  })

  const previewMutation = useMutation({
    mutationFn: (file) =>
      mode === 'IA' ? previewImportAI(file, anneeId) : previewImport(file, mode, anneeId),
    onSuccess: (data) => {
      setPlan(data)
      setCustomColumns([])
    },
    onError: (err) => {
      const msg = err?.response?.data?.file || err?.message || "Erreur lors de l'analyse du fichier"
      toast.error(msg)
    },
  })

  const commitMutation = useMutation({
    mutationFn: () => {
      const emptyName = plan.classes.find((c) => c.action === 'create' && !c.name.trim())
      if (emptyName) {
        throw new Error('Une classe à créer a un nom vide — complétez-le ou associez-la à une classe existante.')
      }
      return commitImport(plan, anneeId)
    },
    onSuccess: (data) => {
      const parts = [`${data.eleves_created} élève(s) créé(s)`]
      if (data.eleves_updated) parts.push(`${data.eleves_updated} mis à jour`)
      parts.push(`${data.classes_created} classe(s) créée(s)`)
      toast.success(parts.join(', '))
      setPlan(null)
      setCustomColumns([])
    },
    onError: (err) => toast.error(err?.message || "Erreur lors de la création des données"),
  })

  const onDrop = useCallback(
    (acceptedFiles) => {
      const file = acceptedFiles[0]
      if (file) {
        previewMutation.mutate(file)
      }
    },
    [previewMutation],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/pdf': ['.pdf'],
    },
    multiple: false,
  })

  function updateClasseAction(ref, action, matchId) {
    setPlan((prev) => ({
      ...prev,
      classes: prev.classes.map((c) => {
        if (c.ref !== ref) return c
        if (action === 'match') {
          const matched = existingClasses.find((ec) => ec.id === matchId)
          return { ...c, action, match_id: matchId, name: matched?.name ?? c.name }
        }
        return { ...c, action: 'create', match_id: null }
      }),
    }))
  }

  function updateClasseName(ref, name) {
    setPlan((prev) => ({
      ...prev,
      classes: prev.classes.map((c) => (c.ref === ref ? { ...c, name } : c)),
    }))
  }

  function addManualClasse() {
    setPlan((prev) => {
      const ref = `manuel-${prev.classes.length}-${Date.now()}`
      return {
        ...prev,
        classes: [
          ...prev.classes,
          {
            ref,
            source_name: '',
            action: 'create',
            match_id: null,
            match_score: null,
            name: '',
            level: '',
          },
        ],
      }
    })
  }

  function updateCell(rowIndex, key, value) {
    setPlan((prev) => ({
      ...prev,
      rows: prev.rows.map((r, i) => (i === rowIndex ? { ...r, [key]: value } : r)),
    }))
  }

  function updateExtra(rowIndex, columnName, value) {
    setPlan((prev) => ({
      ...prev,
      rows: prev.rows.map((r, i) =>
        i === rowIndex ? { ...r, extra: { ...r.extra, [columnName]: value } } : r,
      ),
    }))
  }

  function applyPastedCell(rowIndex, columnKey, value) {
    if (FIXED_KEYS.has(columnKey)) {
      updateCell(rowIndex, columnKey, value)
    } else {
      updateExtra(rowIndex, columnKey, value)
    }
  }

  function deleteRow(rowIndex) {
    setPlan((prev) => ({
      ...prev,
      rows: prev.rows.filter((_, i) => i !== rowIndex),
    }))
  }

  function deleteCustomColumn(slug) {
    setCustomColumns((prev) => prev.filter((c) => c.slug !== slug))
    setPlan((prev) => ({
      ...prev,
      rows: prev.rows.map((r) => {
        if (!r.extra || !(slug in r.extra)) return r
        const { [slug]: _removed, ...rest } = r.extra
        return { ...r, extra: rest }
      }),
    }))
  }

  function deleteClasse(ref) {
    setPlan((prev) => ({
      ...prev,
      classes: prev.classes.filter((c) => c.ref !== ref),
      rows: prev.rows.map((r) => (r.classe_ref === ref ? { ...r, classe_ref: null } : r)),
    }))
  }

  function confirmAddColumn() {
    const name = newColumnName.trim()
    if (!name) {
      setAddingColumn(false)
      return
    }
    addColumnMutation.mutate(name)
  }

  // Groupe les indices de plan.rows par classe (le groupe "Sans classe" en premier).
  const groups = useMemo(() => {
    if (!plan) return []
    const byRef = new Map()
    plan.rows.forEach((row, idx) => {
      const key = row.classe_ref || NONE_GROUP
      if (!byRef.has(key)) byRef.set(key, [])
      byRef.get(key).push(idx)
    })

    const result = []
    if (byRef.has(NONE_GROUP)) {
      result.push({ key: NONE_GROUP, label: 'Sans classe assignée', indices: byRef.get(NONE_GROUP) })
    }
    for (const c of plan.classes) {
      if (byRef.has(c.ref)) {
        result.push({ key: c.ref, label: c.name || c.source_name || '(sans nom)', indices: byRef.get(c.ref) })
      }
    }
    return result
  }, [plan])

  // Ordre des colonnes collables (colle Excel) — la Classe (un Select) en est exclue.
  const pasteableColumns = useMemo(
    () => [...FIXED_COLUMNS.map((c) => c.key), ...customColumns.map((c) => c.slug)],
    [customColumns],
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-semibold">Import Excel / PDF</h2>
        <p className="text-muted-foreground text-sm">
          Importez vos élèves, classes et parents depuis un fichier
          {annee && (
            <>
              {' '}— année <span className="font-medium text-foreground">{annee.label}</span>
            </>
          )}
        </p>
        {annee && !annee.is_current && (
          <p className="mt-1 text-sm text-amber-600">
            Vous importez sur une année qui n'est pas l'année en cours. Changez d'année dans
            l'en-tête si ce n'est pas voulu.
          </p>
        )}
      </div>

      {!plan && (
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>1. Choisir le mode puis déposer le fichier</CardTitle>
              <CardDescription>
                {mode === 'DETERMINISTE' ? (
                  <>
                    Colonnes attendues : {columns?.required?.join(', ')}
                    {columns?.optional?.length ? ` — optionnel : ${columns.optional.join(', ')}` : ''}
                    {' '}(pas de colonne Classe ? pas de problème, vous l'assignerez à la vérification)
                  </>
                ) : (
                  "N'importe quelle disposition de colonnes : une IA analyse le fichier et propose le mapping (à vérifier avant import)."
                )}
              </CardDescription>
            </div>
            {mode === 'DETERMINISTE' && (
              <Button variant="outline" size="sm" onClick={downloadImportTemplate} className="shrink-0">
                <Download className="size-4" />
                Télécharger un modèle
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={mode} onValueChange={setMode}>
              <TabsList>
                <TabsTrigger value="DETERMINISTE">Format exact</TabsTrigger>
                <TabsTrigger value="IA">IA (fichier libre)</TabsTrigger>
              </TabsList>
            </Tabs>

            <div
              {...getRootProps()}
              className={`rounded-lg border-2 border-dashed p-10 text-center cursor-pointer transition-colors ${
                isDragActive ? 'border-primary-500 bg-primary-50' : 'border-border'
              }`}
            >
              <input {...getInputProps()} />
              {previewMutation.isPending ? (
                <p>
                  {mode === 'IA'
                    ? "Analyse IA en cours... ça peut prendre jusqu'à une minute pour un gros fichier."
                    : 'Analyse en cours...'}
                </p>
              ) : (
                <p className="text-muted-foreground">
                  Glissez un fichier .xlsx ou .pdf ici, ou cliquez pour choisir
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {plan && (
        <div className="space-y-6">
          {plan.notices?.length > 0 && (
            <div className="rounded-lg border border-accent-500 bg-accent-100 p-4">
              <p className="font-medium text-neutral-950">Ce qui a été lu dans votre fichier</p>
              <ul className="mt-2 space-y-1 text-sm text-neutral-800">
                {plan.notices.map((n, i) => (
                  <li key={i}>• {n}</li>
                ))}
              </ul>
            </div>
          )}

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-4">
              <div>
                <CardTitle>2. Vérifier les classes</CardTitle>
                <CardDescription>
                  Confirmez si chaque classe doit être créée ou associée à une classe existante — les
                  noms sont modifiables.
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={addManualClasse} className="shrink-0">
                <Plus className="size-4" />
                Ajouter une classe
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {plan.classes.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Aucune classe détectée dans le fichier. Les élèves seront importés sans classe — vous
                  pouvez en ajouter une ci-dessus et l'assigner à l'étape suivante.
                </p>
              )}
              {plan.classes.map((c) => (
                <div
                  key={c.ref}
                  className="flex items-center justify-between gap-4 rounded-md border border-border p-3"
                >
                  <div className="flex-1 min-w-0">
                    {c.action === 'create' ? (
                      <>
                        <Input
                          value={c.name}
                          onChange={(e) => updateClasseName(c.ref, e.target.value)}
                          placeholder="Nom de la classe"
                          className="h-8 max-w-64"
                        />
                        {c.source_name && c.source_name !== c.name && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Détectée dans le fichier : « {c.source_name} »
                          </p>
                        )}
                      </>
                    ) : (
                      <div>
                        <span className="font-medium">{c.name}</span>
                        {c.match_score && (
                          <Badge variant="secondary" className="ml-2">
                            {c.match_score}% de correspondance
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                  <Select
                    value={c.action === 'match' ? `match:${c.match_id}` : 'create'}
                    onValueChange={(v) => {
                      if (v === 'create') {
                        updateClasseAction(c.ref, 'create', null)
                      } else {
                        updateClasseAction(c.ref, 'match', Number(v.split(':')[1]))
                      }
                    }}
                  >
                    <SelectTrigger className="w-64 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="create">Créer une nouvelle classe</SelectItem>
                      {existingClasses.map((ec) => (
                        <SelectItem key={ec.id} value={`match:${ec.id}`}>
                          Associer à « {ec.name} »
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 text-secondary-600 hover:text-secondary-700"
                    onClick={() => deleteClasse(c.ref)}
                    title="Supprimer cette classe (les élèves passeront en « Sans classe »)"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-4">
              <div>
                <CardTitle>3. Vérifier et compléter les données</CardTitle>
                <CardDescription>
                  {plan.rows.length} élève(s), regroupés par classe — modifiez directement les cellules
                  si besoin
                </CardDescription>
              </div>
              {addingColumn ? (
                <div className="flex items-center gap-1 shrink-0">
                  <Input
                    autoFocus
                    list="existing-custom-fields"
                    value={newColumnName}
                    onChange={(e) => setNewColumnName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && confirmAddColumn()}
                    placeholder="Nom colonne"
                    className="h-8 w-40"
                  />
                  <datalist id="existing-custom-fields">
                    {existingCustomFields.map((f) => (
                      <option key={f.id} value={f.name} />
                    ))}
                  </datalist>
                  <Button size="icon-sm" variant="ghost" onClick={confirmAddColumn} disabled={addColumnMutation.isPending}>
                    <Plus className="size-4" />
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setAddingColumn(true)} className="shrink-0">
                  <Plus className="size-4" />
                  Colonne personnalisée
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-6">
              {groups.map((group) => (
                <div key={group.key}>
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-display font-semibold">
                      {group.key === NONE_GROUP ? (
                        <span className="text-secondary-600">{group.label}</span>
                      ) : (
                        group.label
                      )}
                    </h3>
                    <Badge variant="secondary">{group.indices.length} élève(s)</Badge>
                  </div>
                  <div className="rounded-lg border border-border overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="whitespace-nowrap">Statut</TableHead>
                          {FIXED_COLUMNS.map((col) => (
                            <TableHead key={col.key} className="whitespace-nowrap">
                              {col.label}
                            </TableHead>
                          ))}
                          <TableHead className="whitespace-nowrap">Classe</TableHead>
                          {customColumns.map((col) => (
                            <TableHead key={col.slug} className="whitespace-nowrap">
                              <div className="flex items-center gap-1">
                                {col.name}
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="size-5 shrink-0 text-muted-foreground hover:text-secondary-600"
                                  onClick={() => deleteCustomColumn(col.slug)}
                                  title="Supprimer cette colonne"
                                >
                                  <Trash2 className="size-3" />
                                </Button>
                              </div>
                            </TableHead>
                          ))}
                          <TableHead className="whitespace-nowrap" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.indices.map((idx, rowPos) => {
                          const row = plan.rows[idx]
                          return (
                            <TableRow key={idx}>
                              <TableCell className="p-1">
                                {row.action === 'update' ? (
                                  <Badge
                                    variant="secondary"
                                    title="Un élève du même nom (ou matricule) existe déjà — ses données seront mises à jour au lieu d'être dupliquées."
                                  >
                                    Mise à jour
                                  </Badge>
                                ) : (
                                  <Badge variant="outline">Nouveau</Badge>
                                )}
                              </TableCell>
                              {FIXED_COLUMNS.map((col, colIdx) => (
                                <TableCell key={col.key} className="p-1">
                                  <Input
                                    value={row[col.key] ?? ''}
                                    onChange={(e) => updateCell(idx, col.key, e.target.value)}
                                    onPaste={(e) =>
                                      handlePasteFill({
                                        event: e,
                                        rows: group.indices,
                                        columns: pasteableColumns,
                                        rowIndex: rowPos,
                                        colIndex: colIdx,
                                        applyCell: applyPastedCell,
                                      })
                                    }
                                    className="h-8 min-w-28 border-transparent hover:border-input focus:border-input"
                                  />
                                </TableCell>
                              ))}
                              <TableCell className="p-1">
                                <Select
                                  value={row.classe_ref || NONE_GROUP}
                                  onValueChange={(v) =>
                                    updateCell(idx, 'classe_ref', v === NONE_GROUP ? null : v)
                                  }
                                >
                                  <SelectTrigger className="h-8 w-36">
                                    <SelectValue placeholder="Aucune" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value={NONE_GROUP}>Aucune</SelectItem>
                                    {plan.classes.map((c) => (
                                      <SelectItem key={c.ref} value={c.ref}>
                                        {c.name || c.source_name || '(sans nom)'}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              {customColumns.map((col, customIdx) => (
                                <TableCell key={col.slug} className="p-1">
                                  <Input
                                    value={row.extra?.[col.slug] ?? ''}
                                    onChange={(e) => updateExtra(idx, col.slug, e.target.value)}
                                    onPaste={(e) =>
                                      handlePasteFill({
                                        event: e,
                                        rows: group.indices,
                                        columns: pasteableColumns,
                                        rowIndex: rowPos,
                                        colIndex: FIXED_COLUMNS.length + customIdx,
                                        applyCell: applyPastedCell,
                                      })
                                    }
                                    className="h-8 min-w-28 border-transparent hover:border-input focus:border-input"
                                  />
                                </TableCell>
                              ))}
                              <TableCell className="p-1">
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="text-muted-foreground hover:text-secondary-600"
                                  onClick={() => deleteRow(idx)}
                                  title="Supprimer cet élève de l'import"
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPlan(null)}>
              Annuler
            </Button>
            <Button onClick={() => commitMutation.mutate()} disabled={commitMutation.isPending}>
              {commitMutation.isPending
                ? 'Import en cours...'
                : `Confirmer l'import (${plan.rows.length} élèves)`}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
