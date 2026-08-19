import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { AnimatePresence, motion } from 'framer-motion'
import { Boxes } from 'lucide-react'
import { toast } from '@/lib/toast'
import { login } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DiaTextReveal } from '@/components/ui/dia-text-reveal'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/stores/authStore'
import { getErrorMessage } from '@/lib/utils'

const authSchema = z.object({
  username: z.string().min(2, 'Минимум 2 символа'),
  password: z.string().min(4, 'Минимум 4 символа'),
})

type AuthForm = z.infer<typeof authSchema>

const BRAND_COLORS = ['#22d3ee', '#818cf8', '#f472b6', '#34d399']
const REVEAL_DURATION_SEC = 1.8
const GREETING_HOLD_MS = 900

export function LoginPage() {
  const navigate = useNavigate()
  const setToken = useAuthStore((state) => state.setToken)
  const [showGreeting, setShowGreeting] = useState(false)
  const [greetingKey, setGreetingKey] = useState(0)

  const form = useForm<AuthForm>({
    resolver: zodResolver(authSchema),
    defaultValues: { username: '', password: '' },
  })

  const finishGreeting = () => {
    toast.success('Вход выполнен')
    navigate('/orders', { replace: true })
  }

  const mutation = useMutation({
    mutationFn: login,
    onSuccess: (token) => {
      setToken(token.access_token)
      setGreetingKey((key) => key + 1)
      setShowGreeting(true)
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-md">
        <Boxes aria-label="WMS" className="size-6 text-primary" role="img" />
        <Card.Header>
          <Card.Title className="text-xl">Вход в WMS</Card.Title>
          <Card.Description className="text-muted-foreground">
            Введите имя пользователя и пароль
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <form className="space-y-4" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
            <div className="space-y-2">
              <Label htmlFor="username">Имя пользователя</Label>
              <Input id="username" autoComplete="username" {...form.register('username')} />
              {form.formState.errors.username ? (
                <p className="text-sm text-error">{form.formState.errors.username.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Пароль</Label>
              <Input id="password" type="password" autoComplete="current-password" {...form.register('password')} />
              {form.formState.errors.password ? (
                <p className="text-sm text-error">{form.formState.errors.password.message}</p>
              ) : null}
            </div>
            <div className="flex justify-center pt-1">
              <Button
                className="min-w-[9.5rem] px-8"
                type="submit"
                disabled={mutation.isPending || showGreeting}
              >
                {mutation.isPending ? 'Входим...' : 'Войти'}
              </Button>
            </div>
          </form>
        </Card.Content>
      </Card>

      {typeof document !== 'undefined'
        ? createPortal(
            <AnimatePresence>
              {showGreeting ? (
                <motion.div
                  key={`login-greeting-${greetingKey}`}
                  className="fixed inset-0 z-[10000] flex items-center justify-center bg-background px-6"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                >
                  <DiaTextReveal
                    key={greetingKey}
                    className="text-center text-4xl font-bold tracking-tight sm:text-5xl"
                    colors={BRAND_COLORS}
                    text="GRUNDLAGE WMS"
                    textColor="hsl(var(--wms-foreground))"
                    startOnView={false}
                    once={false}
                    duration={REVEAL_DURATION_SEC}
                    onComplete={() => {
                      window.setTimeout(finishGreeting, GREETING_HOLD_MS)
                    }}
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </main>
  )
}
