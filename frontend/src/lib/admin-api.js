import { api, unwrapList } from './api'

export async function fetchSchools() {
  const { data } = await api.get('/schools/')
  return unwrapList(data)
}

export async function updateSchool(id, payload) {
  const { data } = await api.patch(`/schools/${id}/`, payload)
  return data
}
