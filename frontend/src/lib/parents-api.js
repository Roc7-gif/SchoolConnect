import { api, unwrapList } from './api'

export async function fetchParents(search) {
  const { data } = await api.get('/parents/', { params: search ? { search } : undefined })
  return unwrapList(data)
}

export async function createParent(payload) {
  const { data } = await api.post('/parents/', payload)
  return data
}

export async function updateParent(id, payload) {
  const { data } = await api.patch(`/parents/${id}/`, payload)
  return data
}

export async function deleteParent(id) {
  await api.delete(`/parents/${id}/`)
}

export async function createStudentGuardian(payload) {
  const { data } = await api.post('/student-guardians/', payload)
  return data
}

export async function deleteStudentGuardian(id) {
  await api.delete(`/student-guardians/${id}/`)
}
