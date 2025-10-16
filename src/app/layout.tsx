"use client"

import type React from "react"
import "./globals.css"
import { Toaster } from "@/components/ui/toaster"
import { StockNotifier } from "@/components/stock-notifier"
import { AppSidebar } from "@/components/app-sidebar"
import { AuthGate } from "@/components/auth/auth-gate"
import { usePathname } from "next/navigation"

function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuthPage = pathname.startsWith("/auth")

  return (
    <AuthGate>
      {isAuthPage ? (
        children
      ) : (
        <>
          <div className="flex h-full">
            <AppSidebar />
            <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">{children}</main>
          </div>
          <StockNotifier />
        </>
      )}
    </AuthGate>
  )
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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* Add viewport meta tag for proper mobile rendering */}
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </head>
      <body className="font-body antialiased h-full bg-background">
        <LayoutContent>{children}</LayoutContent>
        <Toaster />
      </body>
    </html>
  )
}