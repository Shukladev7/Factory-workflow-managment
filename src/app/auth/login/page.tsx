"use client"

import { useState } from "react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { signInWithEmailAndPassword } from "firebase/auth"
import { getFirebaseAuth } from "@/lib/firebase-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { useToast } from "@/hooks/use-toast"
import Link from "next/link"
import { useRouter } from "next/navigation"
// import Image from "next/image"

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6, "Password must be at least 6 characters"),
})

type FormValues = z.infer<typeof schema>

export default function LoginPage() {
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } })
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const onSubmit = async (values: FormValues) => {
    setLoading(true)
    try {
      const auth = getFirebaseAuth()
      await signInWithEmailAndPassword(auth, values.email, values.password)

      toast({ title: "Welcome back!" })
      router.push("/")
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Sign in failed",
        description: e?.message || "Invalid email or password.",
      })
    } finally {
      setLoading(false)
    }
  }

  const onForgot = async () => {
    try {
      const email = form.getValues("email")
      if (!email) {
        toast({ title: "Enter your email first", variant: "destructive" })
        return
      }
      const auth = getFirebaseAuth()
      await import("firebase/auth").then(({ sendPasswordResetEmail }) =>
        sendPasswordResetEmail(auth, email, { url: `${window.location.origin}/auth/login` }),
      )
      toast({ title: "Password reset sent", description: "Check your email for a reset link." })
    } catch (e: any) {
      toast({ title: "Failed to send reset", description: e?.message, variant: "destructive" })
    }
  }

  return (
    <main className="max-w-md mx-auto p-6 space-y-6">
      <div className="flex items-center justify-center">
        <img
          src="/images/npe-logo.jpg"
          alt="NPE logo"
          width={120}
          height={120}
          loading="eager"
          decoding="async"
          className="h-16 w-auto md:h-20"
        />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-balance">Sign in</h1>
        <p className="text-sm text-muted-foreground text-pretty">Use the password you set from the email link.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="you@example.com" {...field} />
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
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input type="password" placeholder="••••••••" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </Form>

      <div className="flex items-center justify-between">
        <Link href="/auth/signup" className="text-sm text-primary underline underline-offset-4">
          Create account
        </Link>
        <button onClick={onForgot} className="text-sm text-primary underline underline-offset-4">
          Forgot password?
        </button>
      </div>
    </main>
  )
}
