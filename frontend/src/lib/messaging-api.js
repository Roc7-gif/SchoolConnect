import { api, unwrapList } from './api'

/** Variables utilisables dans un message — dépend de l'école, les champs personnalisés
 *  créés à l'import en font partie. */
export async function fetchMessageVariables() {
  const { data } = await api.get('/messages/variables/')
  return data
}

export async function fetchTemplates() {
  const { data } = await api.get('/message-templates/')
  return unwrapList(data)
}

export async function createTemplate(payload) {
  const { data } = await api.post('/message-templates/', payload)
  return data
}

export async function updateTemplate(id, payload) {
  const { data } = await api.patch(`/message-templates/${id}/`, payload)
  return data
}

export async function deleteTemplate(id) {
  await api.delete(`/message-templates/${id}/`)
}

export async function fetchMessages() {
  const { data } = await api.get('/messages/')
  return unwrapList(data)
}

export async function sendMessage(payload) {
  const { data } = await api.post('/messages/', payload)
  return data
}

/** Simule l'envoi côté serveur (rien n'est enregistré) pour confirmation avant lancement. */
export async function previewMessage(payload) {
  const { data } = await api.post('/messages/preview/', payload)
  return data
}

export async function fetchMessage(id) {
  const { data } = await api.get(`/messages/${id}/`)
  return data
}

export async function resendMessage(id) {
  const { data } = await api.post(`/messages/${id}/resend/`)
  return data
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** L'envoi tourne en tâche Celery ; on attend que le statut sorte de BROUILLON. */
export async function sendMessageAndWait(payload) {
  const created = await sendMessage(payload)
  let message = created
  for (let i = 0; i < 25 && message.status === 'BROUILLON'; i++) {
    await sleep(400)
    message = await fetchMessage(message.id)
  }
  return message
}
