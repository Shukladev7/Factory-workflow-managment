"use client";

import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type SortDirection = "asc" | "desc" | "none";

interface SortControlsProps {
  sortDirection: SortDirection;
  onSortChange: (direction: SortDirection) => void;
  label?: string;
}

export function SortControls({ 
  sortDirection, 
  onSortChange, 
  label = "Sort" 
}: SortControlsProps) {
  const getSortIcon = () => {
    switch (sortDirection) {
      case "asc":
        return <ArrowUp className="h-4 w-4" />;
      case "desc":
        return <ArrowDown className="h-4 w-4" />;
      default:
        return <ArrowUpDown className="h-4 w-4" />;
    }
  };

  const getSortLabel = () => {
    switch (sortDirection) {
      case "asc":
        return "A-Z";
      case "desc":
        return "Z-A";
      default:
        return "Sort";
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          {getSortIcon()}
          {getSortLabel()}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onSortChange("asc")}>
          <ArrowUp className="mr-2 h-4 w-4" />
          A to Z
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSortChange("desc")}>
          <ArrowDown className="mr-2 h-4 w-4" />
          Z to A
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSortChange("none")}>
          <ArrowUpDown className="mr-2 h-4 w-4" />
          Default
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Utility function for sorting arrays
export function sortArray<T>(
  array: T[],
  direction: SortDirection,
  getKey: (item: T) => string
): T[] {
  if (direction === "none") return array;
  
  return [...array].sort((a, b) => {
    // Normalize keys for reliable A–Z sorting
    const rawA = getKey(a) ?? "";
    const rawB = getKey(b) ?? "";
    const aKey = rawA.toString().trim().toLowerCase();
    const bKey = rawB.toString().trim().toLowerCase();
    
    if (direction === "asc") {
      return aKey.localeCompare(bKey);
    } else {
      return bKey.localeCompare(aKey);
    }
  });
}
