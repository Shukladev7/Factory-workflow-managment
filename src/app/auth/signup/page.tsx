"use client"

import { useState } from "react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { getFirebaseAuth } from "@/lib/firebase-client"
import { sendPasswordResetEmail } from "firebase/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { useToast } from "@/hooks/use-toast"
import Link from "next/link"

const schema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2, "Please enter your full name"),
})

type FormValues = z.infer<typeof schema>

export default function SignupPage() {
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: "", fullName: "" } })
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const onSubmit = async (values: FormValues) => {
    setLoading(true)
    try {
      // Create or update user on server with displayName
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || "Failed to create user")
      }

      // Ask Firebase to email the "set password" link to the user
      const auth = getFirebaseAuth()
      await sendPasswordResetEmail(auth, values.email, {
        url: `${window.location.origin}/auth/login`,
      })

      toast({
        title: "Check your email",
        description: "We sent you a link to set your password.",
      })

      form.reset()
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Signup failed",
        description: e?.message || "Something went wrong.",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="max-w-md mx-auto p-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-balance">Create your account</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Enter your email and full name. We’ll send you a link to set your password.
        </p>
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
            name="fullName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Full name</FormLabel>
                <FormControl>
                  <Input placeholder="Ada Lovelace" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Sending..." : "Send set-password link"}
          </Button>
        </form>
      </Form>

      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/auth/login" className="text-primary underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </main>
  )
}
