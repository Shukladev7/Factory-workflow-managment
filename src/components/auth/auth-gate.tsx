"use client"

import { type PropsWithChildren, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { onAuthStateChanged, type User } from "firebase/auth"
import { getFirebaseAuth } from "@/lib/firebase-client"

export function AuthGate({ children }: PropsWithChildren) {
  const pathname = usePathname()
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [user, setUser] = useState<User | null>(null)

  // Public routes: auth pages and framework assets
  const isPublic = useMemo(() => {
    return (
      pathname.startsWith("/auth") ||
      pathname.startsWith("/api") ||
      pathname.startsWith("/_next") ||
      pathname.startsWith("/assets") ||
      pathname.startsWith("/favicon") ||
      pathname.startsWith("/icons") ||
      pathname.startsWith("/images")
    )
  }, [pathname])

  useEffect(() => {
    const auth = getFirebaseAuth()
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u)
      setChecking(false)
      if (!u && !isPublic) {
        router.replace("/auth/login")
      }
    })
    return () => unsub()
  }, [isPublic, router])

  // Allow auth pages and assets through without gating
  if (isPublic) return <>{children}</>

  // Show a small checking state while we resolve auth
  if (checking) {
    return (
      <div className="min-h-dvh grid place-items-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" aria-hidden />
          <p className="text-sm text-gray-600" aria-live="polite">
            Checking authentication…
          </p>
        </div>
      </div>
    )
  }

  // If not authenticated, we already redirected; render nothing to avoid flicker
  if (!user) return null

  return <>{children}</>
}
