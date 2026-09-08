import { api } from './api'

/** Relevé de consommation de l'école : mois en cours, historique et derniers envois. */
export async function fetchBillingSummary() {
  const { data } = await api.get('/billing/summary/')
  return data
}
