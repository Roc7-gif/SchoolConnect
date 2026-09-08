import { api } from './api'

export async function requestPasswordReset(email) {
  const { data } = await api.post('/password-reset/', { email })
  return data
}

export async function confirmPasswordReset({ uid, token, new_password }) {
  const { data } = await api.post('/password-reset/confirm/', { uid, token, new_password })
  return data
}

export async function updateProfile(payload) {
  const { data } = await api.patch('/me/', payload)
  return data
}
