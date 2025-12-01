"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Building2, LogOut, LogIn, UserPlus, Menu } from "lucide-react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { useEffect, useState } from "react"
import { getFirebaseAuth } from "@/lib/firebase-client"
import { onAuthStateChanged, signOut, type User } from "firebase/auth"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { usePermissions } from "@/hooks/use-permissions"
import Image from "next/image"

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

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const { canView, loading: permissionsLoading, employee } = usePermissions()
  const [isCollapsed, setIsCollapsed] = useState(false)

  useEffect(() => {
    const auth = getFirebaseAuth()
    const unsub = onAuthStateChanged(auth, (u) => setUser(u))
    return () => unsub()
  }, [])

  function initials(name?: string | null, email?: string | null) {
    const base = name || email || "U"
    const parts = base.split(" ")
    const chars = parts.length >= 2 ? `${parts[0][0] ?? ""}${parts[1][0] ?? ""}` : `${base[0] ?? "U"}`
    return chars.toUpperCase()
  }

  // Filter navigation items based on permissions
  const getVisibleNavItems = () => {
    if (permissionsLoading || !employee) {
      // Show all items while loading or if no employee data
      return navItems
    }
    
    return navItems.filter(item => {
      // Everyone can view all modules
      if (item.module && canView(item.module)) {
        if (item.items) {
          // For menu items, filter sub-items based on permissions
          const visibleSubItems = item.items.filter(subItem => 
            subItem.module && canView(subItem.module)
          )
          return visibleSubItems.length > 0
        }
        return true
      }
      return false
    }).map(item => {
      if (item.items) {
        // Return item with filtered sub-items
        return {
          ...item,
          items: item.items.filter(subItem => 
            subItem.module && canView(subItem.module)
          )
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

  return (
    <>
      {/* Desktop sidebar toggle */}
      <div className="hidden md:block">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="fixed top-4 left-4 z-40 h-14 w-14 rounded-full bg-background shadow"
          aria-label={isCollapsed ? "Show sidebar" : "Hide sidebar"}
          onClick={() => setIsCollapsed((prev) => !prev)}
        >
          <Menu className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden md:flex h-full flex-shrink-0 border-r bg-card flex flex-col transition-all duration-300",
          isCollapsed ? "w-0 opacity-0 pointer-events-none" : "w-64",
        )}
      >
        {/* Company Logo */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-center">
            <div className="flex items-center justify-center h-16 w-48">
              <Image 
                src="/images/npe-logo.jpg" 
                alt="Company Logo" 
                width={192}
                height={64}
                className="h-16 w-auto object-contain"
                priority
              />
            </div>
          </div>
        </div>

        <div className="p-4">
          <Link href="/" className="flex items-center space-x-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Building2 className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg">StockPilot</span>
          </Link>
        </div>

        <div className="flex-1 flex flex-col">
          <nav className="flex-1 px-3 py-4 space-y-2">
            {getVisibleNavItems().map((item) =>
              item.isMenu && item.items ? (
                <Accordion
                  key={item.label}
                  type="single"
                  collapsible
                  defaultValue={pathname.startsWith(item.basePath!) ? item.basePath : undefined}
                >
                  <AccordionItem value={item.basePath!} className="border-b-0">
                    <AccordionTrigger
                      className={cn(
                        "flex items-center w-full text-left rounded-lg px-4 py-3 text-lg font-semibold hover:bg-muted/80",
                        pathname.startsWith(item.basePath!)
                          ? "bg-primary/10 text-primary border-l-4 border-primary"
                          : "text-foreground",
                      )}
                    >
                      {item.label}
                    </AccordionTrigger>
                    <AccordionContent className="pl-4 pb-0">
                      {item.items.map((subItem) => (
                        <Link
                          key={subItem.href}
                          href={subItem.href}
                          className={cn(
                            "block rounded-lg px-4 py-2.5 text-base font-medium hover:bg-muted/80",
                            pathname === subItem.href
                              ? "bg-primary/10 text-primary border-l-4 border-primary"
                              : "text-foreground",
                          )}
                        >
                          {subItem.label}
                        </Link>
                      ))}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              ) : (
                <Link
                  key={item.href}
                  href={item.href!}
                  className={cn(
                    "block rounded-lg px-4 py-3 text-lg font-semibold hover:bg-muted/80",
                    pathname === item.href
                      ? "bg-primary/10 text-primary border-l-4 border-primary"
                      : "text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              ),
            )}
          </nav>

          {/* My Account section moved near top */}
          <div className="px-4 pb-2 border-t pt-3">
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="w-full justify-start items-center gap-2 px-2 py-2">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback>{initials(user.displayName, user.email)}</AvatarFallback>
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
              <div className="flex gap-2 w-full">
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
        </div>
      </aside>

      {/* Mobile hamburger */}
      <div className="md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="fixed top-5 left-5 z-50 h-14 w-14 rounded-full bg-background shadow-md border-2 border-primary/10"
              aria-label="Open menu"
            >
              <Menu className="h-7 w-7" />
              <span className="sr-only">Open menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="p-4 border-b">
              {/* Company Logo for Mobile */}
              <div className="flex items-center justify-center mb-4">
                <div className="flex items-center justify-center h-16 w-48">
                  <Image 
                    src="/images/npe-logo.jpg" 
                    alt="Company Logo" 
                    width={250}
                    height={64}
                    className="h-26 w-50 object-contain"
                    priority
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                  <Building2 className="h-5 w-5 text-primary-foreground" />
                </div>
                <SheetTitle className="text-lg font-bold">StockPilot</SheetTitle>
              </div>

              {/* My Account in mobile sheet header */}
              {user ? (
                <div className="mt-4">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="w-full justify-start items-center gap-2 px-2 py-2">
                        <Avatar className="h-9 w-9">
                          <AvatarFallback>{initials(user.displayName, user.email)}</AvatarFallback>
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
                </div>
              ) : (
                <div className="mt-4 flex gap-2">
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
            </SheetHeader>

            <nav className="px-2 py-4 space-y-1">
              {getVisibleNavItems().map((item) =>
                item.isMenu && item.items ? (
                  <Accordion key={item.label} type="single" collapsible>
                    <AccordionItem value={item.label} className="border-b-0">
                      <AccordionTrigger
                        className={cn(
                          "flex items-center w-full text-left rounded-md p-2 text-sm font-medium hover:bg-muted",
                          pathname.startsWith(item.basePath!) ? "text-primary" : "text-foreground",
                        )}
                      >
                        {item.label}
                      </AccordionTrigger>
                      <AccordionContent className="pl-4 pb-0">
                        {item.items.map((subItem) => (
                          <Link
                            key={subItem.href}
                            href={subItem.href}
                            className={cn(
                              "block rounded-md p-2 text-sm font-medium hover:bg-muted",
                              pathname === subItem.href ? "text-primary" : "text-foreground",
                            )}
                          >
                            {subItem.label}
                          </Link>
                        ))}
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href!}
                    className={cn(
                      "block rounded-md p-2 text-sm font-medium hover:bg-muted",
                      pathname === item.href ? "text-primary" : "text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                ),
              )}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </>
  )
}