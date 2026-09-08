import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
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
import { confirmPasswordReset } from '@/lib/accounts-api'
import { getApiErrorMessage } from '@/lib/api'

const schema = z
  .object({
    new_password: z.string().min(8, 'Au moins 8 caractères'),
    confirm_password: z.string().min(1, 'Confirmation requise'),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirm_password'],
  })

export default function ResetPasswordPage() {
  const { uid, token } = useParams()
  const navigate = useNavigate()

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { new_password: '', confirm_password: '' },
  })

  const mutation = useMutation({
    mutationFn: (values) => confirmPasswordReset({ uid, token, new_password: values.new_password }),
  })

  async function onSubmit(values) {
    try {
      await mutation.mutateAsync(values)
    } catch {
      // erreur affichée via mutation.error
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
          <CardDescription>Choisir un nouveau mot de passe</CardDescription>
        </CardHeader>
        <CardContent>
          {mutation.isSuccess ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Votre mot de passe a été mis à jour.
              </p>
              <Button className="w-full" onClick={() => navigate('/connexion', { replace: true })}>
                Se connecter
              </Button>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="new_password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nouveau mot de passe</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="new-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirm_password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirmer le mot de passe</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="new-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {mutation.isError && (
                  <p className="text-sm text-error-600">
                    {getApiErrorMessage(mutation.error, 'Lien invalide ou expiré.')}
                  </p>
                )}
                <Button type="submit" className="w-full" disabled={mutation.isPending}>
                  {mutation.isPending ? 'Mise à jour...' : 'Réinitialiser le mot de passe'}
                </Button>
              </form>
            </Form>
          )}
          <p className="text-sm text-center text-muted-foreground mt-4">
            <Link to="/connexion" className="text-primary-600 hover:underline">
              Retour à la connexion
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
