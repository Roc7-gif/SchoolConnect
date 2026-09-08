import { api, unwrapList } from './api'

export async function fetchAnnees() {
  const { data } = await api.get('/annees/')
  return unwrapList(data)
}

export async function createAnnee(payload) {
  const { data } = await api.post('/annees/', payload)
  return data
}

export async function updateAnnee(id, payload) {
  const { data } = await api.patch(`/annees/${id}/`, payload)
  return data
}

export async function deleteAnnee(id) {
  await api.delete(`/annees/${id}/`)
}

export async function setAnneeCourante(id) {
  const { data } = await api.post(`/annees/${id}/definir-courante/`)
  return data
}

export async function promouvoirAnnee(id, { anneeCible, mapping }) {
  const { data } = await api.post(`/annees/${id}/promouvoir/`, {
    annee_cible: anneeCible,
    mapping,
  })
  return data
}

export async function fetchClasses(search, anneeId) {
  const params = {}
  if (search) params.search = search
  if (anneeId) params.annee = anneeId
  const { data } = await api.get('/classes/', { params })
  return unwrapList(data)
}

export async function createClasse(payload) {
  const { data } = await api.post('/classes/', payload)
  return data
}

export async function updateClasse(id, payload) {
  const { data } = await api.patch(`/classes/${id}/`, payload)
  return data
}

export async function deleteClasse(id) {
  await api.delete(`/classes/${id}/`)
}

export const SANS_CLASSE = 'sans-classe'

export async function fetchEleves(classeId, search, anneeId) {
  const params = {}
  if (classeId) params.classe = classeId
  if (search) params.search = search
  if (anneeId) params.annee = anneeId
  const { data } = await api.get('/eleves/', { params })
  return unwrapList(data)
}

export async function createEleve(payload) {
  const { data } = await api.post('/eleves/', payload)
  return data
}

export async function updateEleve(id, payload) {
  const { data } = await api.patch(`/eleves/${id}/`, payload)
  return data
}

export async function deleteEleve(id) {
  await api.delete(`/eleves/${id}/`)
}

export async function bulkDeleteEleves(ids) {
  const { data } = await api.post('/eleves/bulk-delete/', { ids })
  return data
}

export async function bulkUpdateEleves(updates) {
  const { data } = await api.post('/eleves/bulk-update/', { updates })
  return data
}

export async function fetchCustomFields() {
  const { data } = await api.get('/custom-fields/')
  return unwrapList(data)
}

export async function createCustomField(name) {
  const { data } = await api.post('/custom-fields/', { name })
  return data
}
