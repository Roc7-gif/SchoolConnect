import { createContext, useContext, useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from './auth'
import { createAnnee, fetchAnnees, setAnneeCourante } from './schools-api'

const AnneeContext = createContext(null)
const STORAGE_KEY = 'schoolconnect.annee'

/**
 * Année scolaire consultée. C'est le second axe de cloisonnement après l'école : toutes
 * les listes (classes, élèves) et les envois s'y rapportent.
 *
 * L'identifiant retenu entre dans les `queryKey` des écrans — changer d'année suffit
 * donc à rafraîchir les listes, sans invalidation manuelle.
 */
export function AnneeProvider({ children }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  // Choix explicite de l'utilisateur. L'année réellement appliquée est dérivée plus bas :
  // ce champ peut pointer sur une année disparue (autre école, suppression).
  const [choix, setChoix] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? Number(stored) : null
  })

  const changerAnnee = useCallback((id) => {
    setChoix(id)
    localStorage.setItem(STORAGE_KEY, String(id))
  }, [])

  const { data: annees, isLoading } = useQuery({
    queryKey: ['annees'],
    queryFn: fetchAnnees,
    enabled: Boolean(user),
    staleTime: 5 * 60 * 1000,
  })

  const anneeCourante = useMemo(
    () => annees?.find((a) => a.is_current) ?? null,
    [annees],
  )

  // L'année mémorisée peut ne plus exister (autre école, année supprimée) : on retombe
  // alors sur l'année courante plutôt que de filtrer sur un identifiant fantôme, qui
  // renverrait des listes vides sans explication.
  const annee = useMemo(() => {
    if (!annees?.length) return null
    return annees.find((a) => a.id === choix) ?? anneeCourante ?? annees[0]
  }, [annees, choix, anneeCourante])

  const definirCourante = useMutation({
    mutationFn: setAnneeCourante,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['annees'] }),
  })

  const creer = useMutation({
    mutationFn: createAnnee,
    onSuccess: (nouvelle) => {
      queryClient.invalidateQueries({ queryKey: ['annees'] })
      changerAnnee(nouvelle.id)
    },
  })

  const value = {
    annees: annees ?? [],
    annee,
    anneeId: annee?.id ?? null,
    anneeCourante,
    // Vrai tant que l'école n'a aucune année : les écrans doivent alors inviter à en
    // créer une plutôt qu'afficher des listes vides.
    aucuneAnnee: !isLoading && (annees?.length ?? 0) === 0,
    isLoading,
    changerAnnee,
    definirCourante: definirCourante.mutateAsync,
    creerAnnee: creer.mutateAsync,
  }

  return <AnneeContext.Provider value={value}>{children}</AnneeContext.Provider>
}

export function useAnnee() {
  const ctx = useContext(AnneeContext)
  if (!ctx) {
    throw new Error('useAnnee doit être utilisé à l\'intérieur de AnneeProvider')
  }
  return ctx
}
