"use client";

import { useState, useEffect, useMemo } from "react";
import { Search, Package, Wrench, ShoppingCart, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useFinalStock } from "@/hooks/use-final-stock";
import { useRawMaterials } from "@/hooks/use-raw-materials";
import { useOrders } from "@/hooks/use-orders";

interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  type: "product" | "material" | "order" | "batch";
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface UniversalSearchProps {
  className?: string;
}

export function UniversalSearch({ className }: UniversalSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  
  const { finalStock } = useFinalStock();
  const { rawMaterials } = useRawMaterials();
  const { orders } = useOrders();

  // Keyboard shortcut to open search
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const searchResults = useMemo(() => {
    if (!query || query.length < 2) return [];

    const results: SearchResult[] = [];
    const lowerQuery = query.toLowerCase();

    // Search in Final Stock (Products)
    finalStock.forEach((product) => {
      if (
        product.name.toLowerCase().includes(lowerQuery) ||
        product.sku.toLowerCase().includes(lowerQuery) ||
        (product.productId?.toLowerCase() || "").includes(lowerQuery)
      ) {
        results.push({
          id: `product-${product.id}`,
          title: product.name,
          subtitle: `SKU: ${product.sku}`,
          type: "product",
          href: "/products",
          icon: Package,
        });
      }

      // Search in product batches
      product.batches?.forEach((batch) => {
        if (
          batch.batchId.toLowerCase().includes(lowerQuery) ||
          batch.sku.toLowerCase().includes(lowerQuery)
        ) {
          results.push({
            id: `batch-${batch.batchId}`,
            title: `Batch ${batch.batchId}`,
            subtitle: `Product: ${product.name}`,
            type: "batch",
            href: "/products",
            icon: Package,
          });
        }
      });
    });

    // Search in Raw Materials
    rawMaterials.forEach((material) => {
      if (
        material.name.toLowerCase().includes(lowerQuery) ||
        material.sku.toLowerCase().includes(lowerQuery)
      ) {
        results.push({
          id: `material-${material.id}`,
          title: material.name,
          subtitle: `SKU: ${material.sku} | Qty: ${material.quantity} ${material.unit}`,
          type: "material",
          href: "/materials",
          icon: Wrench,
        });
      }
    });

    // Search in Orders
    orders.forEach((order) => {
      if (
        order.orderId.toLowerCase().includes(lowerQuery) ||
        (order.name?.toLowerCase() || "").includes(lowerQuery) ||
        (order.productName?.toLowerCase() || "").includes(lowerQuery) ||
        order.orderType.toLowerCase().includes(lowerQuery)
      ) {
        results.push({
          id: `order-${order.id}`,
          title: order.orderId,
          subtitle: `${order.productName} | Type: ${order.orderType}`,
          type: "order",
          href: "/orders",
          icon: ShoppingCart,
        });
      }
    });

    return results.slice(0, 10); // Limit to 10 results
  }, [query, finalStock, rawMaterials, orders]);

  const handleSelect = (href: string) => {
    setOpen(false);
    setQuery("");
    router.push(href);
  };

  return (
    <>
      <Button
        variant="outline"
        className={`relative w-full justify-start text-sm text-muted-foreground sm:pr-12 md:w-40 lg:w-64 ${className}`}
        onClick={() => setOpen(true)}
      >
        <Search className="mr-2 h-4 w-4" />
        <span className="hidden lg:inline-flex">Search everything...</span>
        <span className="inline-flex lg:hidden">Search...</span>
        <kbd className="pointer-events-none absolute right-1.5 top-1.5 hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Search products, materials, orders..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {searchResults.length > 0 && (
            <>
              <CommandGroup heading="Products">
                {searchResults
                  .filter((result) => result.type === "product")
                  .map((result) => (
                    <CommandItem
                      key={result.id}
                      onSelect={() => handleSelect(result.href)}
                      className="flex items-center gap-2"
                    >
                      <result.icon className="h-4 w-4" />
                      <div className="flex flex-col">
                        <span>{result.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {result.subtitle}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
              </CommandGroup>
              <CommandGroup heading="Batches">
                {searchResults
                  .filter((result) => result.type === "batch")
                  .map((result) => (
                    <CommandItem
                      key={result.id}
                      onSelect={() => handleSelect(result.href)}
                      className="flex items-center gap-2"
                    >
                      <result.icon className="h-4 w-4" />
                      <div className="flex flex-col">
                        <span>{result.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {result.subtitle}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
              </CommandGroup>
              <CommandGroup heading="Raw Materials">
                {searchResults
                  .filter((result) => result.type === "material")
                  .map((result) => (
                    <CommandItem
                      key={result.id}
                      onSelect={() => handleSelect(result.href)}
                      className="flex items-center gap-2"
                    >
                      <result.icon className="h-4 w-4" />
                      <div className="flex flex-col">
                        <span>{result.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {result.subtitle}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
              </CommandGroup>
              <CommandGroup heading="Orders">
                {searchResults
                  .filter((result) => result.type === "order")
                  .map((result) => (
                    <CommandItem
                      key={result.id}
                      onSelect={() => handleSelect(result.href)}
                      className="flex items-center gap-2"
                    >
                      <result.icon className="h-4 w-4" />
                      <div className="flex flex-col">
                        <span>{result.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {result.subtitle}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
