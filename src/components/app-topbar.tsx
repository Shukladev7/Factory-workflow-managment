"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Building2, LogOut, LogIn, UserPlus, Menu, ChevronDown } from "lucide-react"
import { useEffect, useState } from "react"
import Image from "next/image"

import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { getFirebaseAuth } from "@/lib/firebase-client"
import { onAuthStateChanged, signOut, type User } from "firebase/auth"
import { usePermissions } from "@/hooks/use-permissions"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

const navItems = [
  { href: "/", label: "Dashboard", module: "Dashboard" as const },
  { href: "/materials", label: "Raw Materials", module: "Raw Materials" as const },
  { href: "/store", label: "Store", module: "Store" as const },
  {
    label: "Batches",
    module: "Batches" as const,
    isMenu: true,
    basePath: "/batches",
    items: [
      { href: "/batches/overview", label: "Overview", module: "Batches" as const },
      { href: "/batches/molding", label: "Moulding", module: "Moulding" as const },
      { href: "/batches/machining", label: "Machining", module: "Machining" as const },
      { href: "/batches/assembling", label: "Assembling", module: "Assembling" as const },
      { href: "/batches/testing", label: "Testing", module: "Testing" as const },
    ],
  },
  { href: "/products", label: "Final Stock", module: "Final Stock" as const },
  { href: "/orders", label: "Orders", module: "Orders" as const },
  { href: "/reports", label: "Reports", module: "Reports" as const },
  { href: "/setup", label: "Setup", module: "Setup" as const },
]

export function AppTopbar() {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const { canView, loading: permissionsLoading, employee } = usePermissions()

  useEffect(() => {
    const auth = getFirebaseAuth()
    const unsub = onAuthStateChanged(auth, (u) => setUser(u))
    return () => unsub()
  }, [])

  function initials(name?: string | null, email?: string | null) {
    const base = name || email || "U"
    const parts = base.split(" ")
    const chars =
      parts.length >= 2
        ? `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`
        : `${base[0] ?? "U"}`
    return chars.toUpperCase()
  }

  const getVisibleNavItems = () => {
    if (permissionsLoading || !employee) {
      return navItems
    }

    return navItems
      .filter((item) => {
        if (item.module && canView(item.module)) {
          if (item.items) {
            const visibleSubItems = item.items.filter(
              (subItem) => subItem.module && canView(subItem.module),
            )
            return visibleSubItems.length > 0
          }
          return true
        }
        return false
      })
      .map((item) => {
        if (item.items) {
          return {
            ...item,
            items: item.items.filter(
              (subItem) => subItem.module && canView(subItem.module),
            ),
          }
        }
        return item
      })
  }

  async function handleLogout() {
    try {
      const auth = getFirebaseAuth()
      await signOut(auth)
      router.push("/auth/login")
    } catch (e) {
      // swallow
    }
  }

  const visibleNav = getVisibleNavItems()

  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b-2 border-slate-300 bg-gradient-to-b from-slate-50 to-slate-100 shadow-md">
      <div className="mx-auto flex h-20 items-center gap-6 px-6 lg:px-8">
        {/* Logo + App name */}
        <Link href="/" className="flex items-center gap-2">
          <div className="hidden sm:flex items-center justify-center h-10 w-32">
            <Image
              src="/images/npe-logo.jpg"
              alt="Company Logo"
              width={128}
              height={40}
              className="h-10 w-auto object-contain"
              priority
            />
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary sm:hidden">
            <Building2 className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="hidden sm:inline-block font-bold text-lg">StockPilot</span>
        </Link>

        {/* Desktop nav - Touch optimized */}
        <nav className="hidden md:flex items-center gap-2 flex-1">
          {visibleNav.map((item) =>
            item.isMenu && item.items ? (
              <DropdownMenu key={item.label}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant={pathname.startsWith(item.basePath!) ? "default" : "ghost"}
                    size="lg"
                    className={cn(
                      "h-12 px-5 text-sm font-semibold tracking-wide gap-2 touch-manipulation",
                      pathname.startsWith(item.basePath!)
                        ? "bg-slate-800 text-white shadow-md hover:bg-slate-700"
                        : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                    )}
                  >
                    <span>{item.label}</span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[200px]">
                  {item.items.map((subItem) => (
                    <DropdownMenuItem
                      key={subItem.href}
                      className={cn(
                        "h-12 text-sm font-medium cursor-pointer touch-manipulation",
                        pathname === subItem.href && "bg-slate-100 font-bold text-slate-900",
                      )}
                      onClick={() => router.push(subItem.href)}
                    >
                      {subItem.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                key={item.href}
                asChild
                variant={pathname === item.href ? "default" : "ghost"}
                size="lg"
                className={cn(
                  "h-12 px-5 text-sm font-semibold tracking-wide touch-manipulation",
                  pathname === item.href
                    ? "bg-slate-800 text-white shadow-md hover:bg-slate-700"
                    : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                )}
              >
                <Link href={item.href!}>{item.label}</Link>
              </Button>
            ),
          )}
        </nav>

        {/* Right side actions */}
        <div className="ml-auto flex items-center gap-3">
          {/* Desktop account */}
          <div className="hidden sm:flex items-center">
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="flex items-center gap-3 px-4 py-2 h-14 bg-white border-2 border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-lg shadow-sm touch-manipulation"
                  >
                    <Avatar className="h-10 w-10 border-2 border-slate-300">
                      <AvatarFallback className="bg-slate-800 text-white font-bold text-sm">
                        {initials(user.displayName, user.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="hidden lg:flex flex-col items-start">
                      <span className="text-sm font-bold text-slate-800 leading-tight">
                        {user.displayName || "User"}
                      </span>
                      <span className="text-xs text-slate-500 leading-tight font-medium">
                        {user.email}
                      </span>
                    </div>
                    <ChevronDown className="h-4 w-4 text-slate-600" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel className="text-base font-bold">Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => router.push("/auth/login")}
                    className="h-12 text-sm font-medium cursor-pointer touch-manipulation"
                  >
                    Switch accounts
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={handleLogout}
                    className="h-12 text-sm font-medium cursor-pointer touch-manipulation text-red-600 focus:text-red-700"
                  >
                    <LogOut className="mr-2 h-5 w-5" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex items-center gap-2">
                <Button asChild variant="outline" size="lg" className="h-12 font-semibold touch-manipulation">
                  <Link href="/auth/login">
                    <LogIn className="mr-2 h-5 w-5" />
                    Login
                  </Link>
                </Button>
                <Button asChild size="lg" className="h-12 font-semibold bg-slate-800 hover:bg-slate-700 touch-manipulation">
                  <Link href="/auth/signup">
                    <UserPlus className="mr-2 h-5 w-5" />
                    Sign up
                  </Link>
                </Button>
              </div>
            )}
          </div>

          {/* Mobile menu */}
          <div className="flex md:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-14 w-14 rounded-lg border-2 border-slate-300 bg-white hover:bg-slate-50 shadow-sm touch-manipulation"
                  aria-label="Open menu"
                >
                  <Menu className="h-6 w-6 text-slate-700" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-80 p-0">
                <SheetHeader className="p-6 border-b-2 border-slate-200 bg-gradient-to-b from-slate-50 to-white">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-800 shadow-md">
                      <Building2 className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex flex-col items-start">
                      <SheetTitle className="text-xl font-bold text-slate-800">StockPilot</SheetTitle>
                      <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">Production</span>
                    </div>
                  </div>
                </SheetHeader>

                <nav className="px-4 py-6 space-y-2">
                  {visibleNav.map((item) =>
                    item.isMenu && item.items ? (
                      <div key={item.label} className="space-y-2">
                        <div className="px-3 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50 rounded-md">
                          {item.label}
                        </div>
                        {item.items.map((subItem) => (
                          <Button
                            key={subItem.href}
                            variant={pathname === subItem.href ? "secondary" : "ghost"}
                            size="lg"
                            className={cn(
                              "w-full justify-start h-12 text-sm font-semibold touch-manipulation",
                              pathname === subItem.href 
                                ? "bg-slate-800 text-white hover:bg-slate-700" 
                                : "text-slate-700 hover:bg-slate-100"
                            )}
                            onClick={() => router.push(subItem.href)}
                          >
                            {subItem.label}
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <Button
                        key={item.href}
                        variant={pathname === item.href ? "secondary" : "ghost"}
                        size="lg"
                        className={cn(
                          "w-full justify-start h-12 text-sm font-semibold touch-manipulation",
                          pathname === item.href 
                            ? "bg-slate-800 text-white hover:bg-slate-700" 
                            : "text-slate-700 hover:bg-slate-100"
                        )}
                        onClick={() => router.push(item.href!)}
                      >
                        {item.label}
                      </Button>
                    ),
                  )}
                </nav>

                <div className="border-t-2 border-slate-200 px-4 py-4 bg-slate-50">
                  {user ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          className="w-full justify-start items-center gap-3 px-3 py-3 h-auto bg-white border-2 border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-lg touch-manipulation"
                        >
                          <Avatar className="h-12 w-12 border-2 border-slate-300">
                            <AvatarFallback className="bg-slate-800 text-white font-bold">
                              {initials(user.displayName, user.email)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col items-start flex-1">
                            <span className="text-sm font-bold text-slate-800 leading-tight">
                              {user.displayName || "User"}
                            </span>
                            <span className="text-xs text-slate-500 leading-tight font-medium">
                              {user.email}
                            </span>
                          </div>
                          <ChevronDown className="h-4 w-4 text-slate-600" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-72" align="start" forceMount>
                        <DropdownMenuLabel className="text-base font-bold">Account</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={() => router.push("/auth/login")}
                          className="h-12 text-sm font-medium cursor-pointer touch-manipulation"
                        >
                          Switch accounts
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={handleLogout}
                          className="h-12 text-sm font-medium cursor-pointer touch-manipulation text-red-600 focus:text-red-700"
                        >
                          <LogOut className="mr-2 h-5 w-5" />
                          <span>Log out</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <Button asChild variant="outline" size="lg" className="w-full h-12 font-semibold bg-white touch-manipulation">
                        <Link href="/auth/login">
                          <LogIn className="mr-2 h-5 w-5" />
                          Login
                        </Link>
                      </Button>
                      <Button asChild size="lg" className="w-full h-12 font-semibold bg-slate-800 hover:bg-slate-700 touch-manipulation">
                        <Link href="/auth/signup">
                          <UserPlus className="mr-2 h-5 w-5" />
                          Sign up
                        </Link>
                      </Button>
                    </div>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  )
}