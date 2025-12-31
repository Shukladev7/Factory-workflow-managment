"use client"

import React, { useEffect } from "react"
import "./globals.css"
import { Toaster } from "@/components/ui/toaster"
import { StockNotifier } from "@/components/stock-notifier"
import { AuthGate } from "@/components/auth/auth-gate"
import { usePathname } from "next/navigation"
import { AppTopbar } from "@/components/app-topbar"

function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuthPage = pathname.startsWith("/auth")

  return (
    <AuthGate>
      {isAuthPage ? (
        children
      ) : (
        <>
          <AppTopbar />
          <div className="min-h-screen bg-background">
            <main className="pt-20 md:pt-20 lg:pt-24 px-4 lg:px-8 pb-4 overflow-y-auto">
              {children}
            </main>
          </div>
          <StockNotifier />
        </>
      )}
    </AuthGate>
  )
}

function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return
    }

    navigator.serviceWorker
      .register("/service-worker.js")
      .catch((error) => {
        console.error("Service worker registration failed", error)
      })
  }, [])

  return null
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="h-full">
      <head>
        <title>StockPilot</title>
        <meta name="description" content="Inventory management for your production plant." />
        <meta name="theme-color" content="#0f172a" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* Add viewport meta tag for proper mobile rendering */}
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </head>
      <body className="font-body antialiased min-h-screen bg-background">
        <LayoutContent>{children}</LayoutContent>
        <Toaster />
        <ServiceWorkerRegister />
      </body>
    </html>
  )
}