import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, Navigate } from 'react-router-dom'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/lib/auth'

const loginSchema = z.object({
  username: z.string().min(1, "Nom d'utilisateur requis"),
  password: z.string().min(1, 'Mot de passe requis'),
})

export default function LoginPage() {
  const { user, isLoading, login, isLoggingIn, loginError } = useAuth()

  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  })

  if (!isLoading && user) {
    return <Navigate to="/" replace />
  }

  async function onSubmit(values) {
    try {
      await login(values)
    } catch {
      // erreur affichée via loginError
    }
  }

  return (
    <div className="min-h-svh flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">
            <span className="text-primary-900 dark:text-primary-100">School</span>
            <span className="text-accent-600">Connect</span>
          </CardTitle>
          <CardDescription>Connectez-vous à votre espace établissement</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nom d'utilisateur</FormLabel>
                    <FormControl>
                      <Input autoComplete="username" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mot de passe</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="current-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <p className="text-right text-sm">
                <Link to="/mot-de-passe-oublie" className="text-primary-600 hover:underline">
                  Mot de passe oublié ?
                </Link>
              </p>
              {loginError && (
                <p className="text-sm text-error-600">
                  Identifiants invalides. Veuillez réessayer.
                </p>
              )}
              <Button type="submit" className="w-full" disabled={isLoggingIn}>
                {isLoggingIn ? 'Connexion...' : 'Se connecter'}
              </Button>

              <p className="text-sm text-center text-muted-foreground">
                Pas encore de compte ?{' '}
                <Link to="/inscription" className="text-primary-600 hover:underline">
                  Créer un compte
                </Link>
              </p>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
