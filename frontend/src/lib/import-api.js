import { api } from './api'

export async function fetchImportColumns() {
  const { data } = await api.get('/imports/columns/')
  return data
}

export async function previewImport(file, mode, anneeId) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('mode', mode)
  if (anneeId) formData.append('annee', anneeId)
  const { data } = await api.post('/imports/preview/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function commitImport(plan, anneeId) {
  const { data } = await api.post('/imports/commit/', { ...plan, annee: anneeId })
  return data
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Mode IA : dispatché en tâche Celery (appels API potentiellement longs), on poll le statut. */
export async function previewImportAI(file, anneeId) {
  const formData = new FormData()
  formData.append('file', file)
  if (anneeId) formData.append('annee', anneeId)
  const { data } = await api.post('/imports/preview-async/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  const taskId = data.task_id

  for (let i = 0; i < 60; i++) {
    const { data: statusData } = await api.get(`/imports/preview-status/${taskId}/`)
    if (statusData.status === 'done') return statusData.plan
    if (statusData.status === 'error') {
      throw new Error(statusData.detail || "L'analyse IA a échoué")
    }
    await sleep(1000)
  }
  throw new Error("L'analyse prend trop de temps — réessayez plus tard.")
}

export async function downloadImportTemplate() {
  const response = await api.get('/imports/template/', { responseType: 'blob' })
  const url = window.URL.createObjectURL(new Blob([response.data]))
  const link = document.createElement('a')
  link.href = url
  link.download = 'modele_import_schoolconnect.xlsx'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}
