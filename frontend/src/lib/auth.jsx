import { createContext, useContext } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, ensureCsrfCookie } from './api'

const AuthContext = createContext(null)

async function fetchMe() {
  const { data } = await api.get('/me/')
  return data
}

export function AuthProvider({ children }) {
  const queryClient = useQueryClient()

  const { data: user, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  const loginMutation = useMutation({
    mutationFn: async ({ username, password }) => {
      await ensureCsrfCookie()
      const { data } = await api.post('/login/', { username, password })
      return data
    },
    onSuccess: (data) => {
      // Un autre compte (donc potentiellement une autre école) vient de s'authentifier :
      // il ne doit jamais hériter des données mises en cache par le compte précédent.
      queryClient.clear()
      queryClient.setQueryData(['me'], data)
    },
  })

  const registerMutation = useMutation({
    mutationFn: async (values) => {
      await ensureCsrfCookie()
      const { data } = await api.post('/register/', values)
      return data
    },
    onSuccess: (data) => {
      queryClient.clear()
      queryClient.setQueryData(['me'], data)
    },
  })

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await api.post('/logout/')
    },
    onSuccess: () => {
      queryClient.clear()
      queryClient.setQueryData(['me'], null)
    },
  })

  const value = {
    user: user ?? null,
    isLoading,
    login: loginMutation.mutateAsync,
    loginError: loginMutation.error,
    isLoggingIn: loginMutation.isPending,
    register: registerMutation.mutateAsync,
    registerError: registerMutation.error,
    isRegistering: registerMutation.isPending,
    logout: logoutMutation.mutateAsync,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth doit être utilisé à l\'intérieur de AuthProvider')
  }
  return ctx
}
