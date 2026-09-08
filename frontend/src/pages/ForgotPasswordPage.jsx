import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
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
import { requestPasswordReset } from '@/lib/accounts-api'

const schema = z.object({
  email: z.string().email('Email invalide'),
})

export default function ForgotPasswordPage() {
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  })

  const mutation = useMutation({
    mutationFn: requestPasswordReset,
  })

  async function onSubmit(values) {
    await mutation.mutateAsync(values.email)
  }

  return (
    <div className="min-h-svh flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">
            <span className="text-primary-900 dark:text-primary-100">School</span>
            <span className="text-accent-600">Connect</span>
          </CardTitle>
          <CardDescription>Mot de passe oublié</CardDescription>
        </CardHeader>
        <CardContent>
          {mutation.isSuccess ? (
            <p className="text-sm text-muted-foreground">
              Si un compte existe avec cet email, un lien de réinitialisation vient d'être
              envoyé. Vérifiez votre boîte de réception.
            </p>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" autoComplete="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={mutation.isPending}>
                  {mutation.isPending ? 'Envoi...' : 'Envoyer le lien de réinitialisation'}
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
