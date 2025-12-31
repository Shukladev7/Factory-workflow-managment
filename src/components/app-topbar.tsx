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
    <header className="fixed inset-x-0 top-0 z-40 border-b bg-card/95 backdrop-blur">
      <div className="mx-auto flex h-16 items-center gap-4 px-4 sm:px-6 lg:px-8">
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

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1 lg:gap-2">
          {visibleNav.map((item) =>
            item.isMenu && item.items ? (
              <DropdownMenu key={item.label}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant={pathname.startsWith(item.basePath!) ? "default" : "ghost"}
                    size="sm"
                    className="gap-1"
                  >
                    <span>{item.label}</span>
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {item.items.map((subItem) => (
                    <DropdownMenuItem
                      key={subItem.href}
                      className={cn(
                        pathname === subItem.href && "bg-muted font-semibold",
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
                size="sm"
                className={cn("px-3", pathname === item.href && "font-semibold")}
              >
                <Link href={item.href!}>{item.label}</Link>
              </Button>
            ),
          )}
        </nav>

        {/* Right side actions */}
        <div className="ml-auto flex items-center gap-2">
          {/* Desktop account */}
          <div className="hidden sm:flex items-center">
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="flex items-center gap-2 px-2 py-1 h-9"
                  >
                    <Avatar className="h-7 w-7">
                      <AvatarFallback>
                        {initials(user.displayName, user.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="hidden md:flex flex-col items-start">
                      <span className="text-xs font-medium leading-tight">
                        {user.displayName || "User"}
                      </span>
                      <span className="text-[10px] text-muted-foreground leading-tight">
                        {user.email}
                      </span>
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => router.push("/auth/login")}>
                    Switch accounts
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex items-center gap-1">
                <Button asChild variant="ghost" size="sm">
                  <Link href="/auth/login">
                    <LogIn className="mr-1 h-4 w-4" />
                    Login
                  </Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/auth/signup">
                    <UserPlus className="mr-1 h-4 w-4" />
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
                  className="h-9 w-9 rounded-full border-primary/10"
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetHeader className="p-4 border-b">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                      <Building2 className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <SheetTitle className="text-lg font-bold">StockPilot</SheetTitle>
                  </div>
                </SheetHeader>

                <nav className="px-3 py-4 space-y-1">
                  {visibleNav.map((item) =>
                    item.isMenu && item.items ? (
                      <div key={item.label} className="space-y-1">
                        <div className="px-2 text-xs font-semibold text-muted-foreground uppercase">
                          {item.label}
                        </div>
                        {item.items.map((subItem) => (
                          <Button
                            key={subItem.href}
                            variant={
                              pathname === subItem.href ? "secondary" : "ghost"
                            }
                            size="sm"
                            className="w-full justify-start"
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
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => router.push(item.href!)}
                      >
                        {item.label}
                      </Button>
                    ),
                  )}
                </nav>

                <div className="border-t px-4 py-3">
                  {user ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          className="w-full justify-start items-center gap-2 px-2 py-2"
                        >
                          <Avatar className="h-9 w-9">
                            <AvatarFallback>
                              {initials(user.displayName, user.email)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col items-start">
                            <span className="text-sm font-medium leading-tight">
                              {user.displayName || "User"}
                            </span>
                            <span className="text-xs text-muted-foreground leading-tight">
                              {user.email}
                            </span>
                          </div>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-56" align="start" forceMount>
                        <DropdownMenuLabel>My Account</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => router.push("/auth/login")}>
                          Switch accounts
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleLogout}>
                          <LogOut className="mr-2 h-4 w-4" />
                          <span>Log out</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <div className="flex gap-2">
                      <Button asChild variant="outline" className="flex-1 bg-transparent">
                        <Link href="/auth/login">
                          <LogIn className="mr-2 h-4 w-4" />
                          Login
                        </Link>
                      </Button>
                      <Button asChild className="flex-1">
                        <Link href="/auth/signup">
                          <UserPlus className="mr-2 h-4 w-4" />
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
