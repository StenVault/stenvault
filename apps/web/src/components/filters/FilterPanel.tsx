/**
 * FilterPanel Component
 *
 * Design System: Obsidian Vault
 * Advanced file filtering with bottom sheet on mobile.
 */

import { useState } from "react";
import { Calendar, File, HardDrive, Tag, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetDescription,
  BottomSheetBody,
  BottomSheetFooter,
  BottomSheetTrigger,
} from "@/components/ui/bottom-sheet";
import { cn } from "@/lib/utils";
import { format, subDays, subMonths, subYears } from "date-fns";

export interface FileFilters {
  fileTypes: string[];
  dateRange: 'all' | '24h' | '7d' | '30d' | '1y' | 'custom';
  customDateStart?: Date;
  customDateEnd?: Date;
  minSize?: number;
  maxSize?: number;
  sizeUnit: 'B' | 'KB' | 'MB' | 'GB';
  tags: string[];
  sortBy: 'name' | 'date' | 'size' | 'type';
  sortOrder: 'asc' | 'desc';
  // Phase 5 Zero-Knowledge: Client-side text search
  searchQuery?: string;
}

interface FilterPanelProps {
  filters: FileFilters;
  onFiltersChange: (filters: FileFilters) => void;
  availableTags?: string[];
  activeFilterCount?: number;
}

export function FilterPanel({
  filters,
  onFiltersChange,
  availableTags = [],
  activeFilterCount = 0,
}: FilterPanelProps) {
  const [open, setOpen] = useState(false);

  const handleReset = () => {
    onFiltersChange({
      fileTypes: [],
      dateRange: 'all',
      sizeUnit: 'MB',
      tags: [],
      sortBy: 'date',
      sortOrder: 'desc',
      searchQuery: '',
    });
  };

  const hasActiveFilters =
    filters.fileTypes.length > 0 ||
    filters.dateRange !== 'all' ||
    filters.minSize !== undefined ||
    filters.maxSize !== undefined ||
    filters.tags.length > 0 ||
    (filters.searchQuery && filters.searchQuery.trim().length > 0);

  return (
    <BottomSheet open={open} onOpenChange={setOpen}>
      <BottomSheetTrigger asChild>
        <Button variant="outline" className="gap-2 relative">
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
            />
          </svg>
          Filters
          {activeFilterCount > 0 && (
            <Badge variant="destructive" size="sm" className="ml-1 px-1.5 min-w-[1.25rem]">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
      </BottomSheetTrigger>

      <BottomSheetContent>
        <BottomSheetHeader>
          <BottomSheetTitle>Advanced Filters</BottomSheetTitle>
          <BottomSheetDescription>
            Filter your files by type, date, size and tags
          </BottomSheetDescription>
        </BottomSheetHeader>

        <BottomSheetBody className="space-y-6">
          {/* File Types Filter */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <File className="w-4 h-4 text-foreground-muted" />
              <label className="text-sm font-medium">File Type</label>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'image', label: 'Images', color: 'text-green-500' },
                { value: 'video', label: 'Videos', color: 'text-purple-500' },
                { value: 'audio', label: 'Audio', color: 'text-orange-500' },
                { value: 'document', label: 'Documents', color: 'text-blue-500' },
                { value: 'other', label: 'Other', color: 'text-gray-500' },
              ].map(({ value, label, color }) => {
                const isSelected = filters.fileTypes.includes(value);
                return (
                  <Button
                    key={value}
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      onFiltersChange({
                        ...filters,
                        fileTypes: isSelected
                          ? filters.fileTypes.filter((t) => t !== value)
                          : [...filters.fileTypes, value],
                      });
                    }}
                    className={cn(
                      "gap-2",
                      isSelected && "shadow-sm"
                    )}
                  >
                    {isSelected && <Check className="w-3 h-3" />}
                    <span className={!isSelected ? color : ""}>{label}</span>
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Date Range Filter */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-foreground-muted" />
              <label className="text-sm font-medium">Date Created</label>
            </div>
            <Select
              value={filters.dateRange}
              onValueChange={(value: FileFilters['dateRange']) =>
                onFiltersChange({ ...filters, dateRange: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="24h">Last 24 hours</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="1y">Last year</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* File Size Filter */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-foreground-muted" />
              <label className="text-sm font-medium">File Size</label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-xs text-foreground-muted">Minimum</label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="0"
                    value={filters.minSize || ''}
                    onChange={(e) =>
                      onFiltersChange({
                        ...filters,
                        minSize: e.target.value ? parseFloat(e.target.value) : undefined,
                      })
                    }
                    className="flex-1"
                  />
                  <Select
                    value={filters.sizeUnit}
                    onValueChange={(value: FileFilters['sizeUnit']) =>
                      onFiltersChange({ ...filters, sizeUnit: value })
                    }
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="B">B</SelectItem>
                      <SelectItem value="KB">KB</SelectItem>
                      <SelectItem value="MB">MB</SelectItem>
                      <SelectItem value="GB">GB</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs text-foreground-muted">Maximum</label>
                <Input
                  type="number"
                  placeholder="∞"
                  value={filters.maxSize || ''}
                  onChange={(e) =>
                    onFiltersChange({
                      ...filters,
                      maxSize: e.target.value ? parseFloat(e.target.value) : undefined,
                    })
                  }
                />
              </div>
            </div>
          </div>

          {/* Tags Filter */}
          {availableTags.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-foreground-muted" />
                <label className="text-sm font-medium">Tags</label>
              </div>
              <div className="flex flex-wrap gap-2">
                {availableTags.map((tag) => {
                  const isSelected = filters.tags.includes(tag);
                  return (
                    <Badge
                      key={tag}
                      variant={isSelected ? "default" : "outline"}
                      className={cn(
                        "cursor-pointer transition-all",
                        isSelected && "shadow-sm"
                      )}
                      onClick={() => {
                        onFiltersChange({
                          ...filters,
                          tags: isSelected
                            ? filters.tags.filter((t) => t !== tag)
                            : [...filters.tags, tag],
                        });
                      }}
                    >
                      {tag}
                      {isSelected && <X className="w-3 h-3 ml-1" />}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sort Options */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Sort By</label>
            <div className="grid grid-cols-2 gap-3">
              <Select
                value={filters.sortBy}
                onValueChange={(value: FileFilters['sortBy']) =>
                  onFiltersChange({ ...filters, sortBy: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="size">Size</SelectItem>
                  <SelectItem value="type">Type</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={filters.sortOrder}
                onValueChange={(value: FileFilters['sortOrder']) =>
                  onFiltersChange({ ...filters, sortOrder: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Ascending</SelectItem>
                  <SelectItem value="desc">Descending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </BottomSheetBody>

        <BottomSheetFooter>
          <Button variant="outline" onClick={handleReset} disabled={!hasActiveFilters}>
            Clear Filters
          </Button>
          <Button onClick={() => setOpen(false)}>
            Apply
          </Button>
        </BottomSheetFooter>
      </BottomSheetContent>
    </BottomSheet>
  );
}

/**
 * Helper function to apply filters to file list
 * Phase 5 Zero-Knowledge: Uses decryptedFilename for search when available
 */
export function applyFilters<T extends {
  fileType: string;
  createdAt: Date;
  size: number;
  filename: string;
  decryptedFilename?: string;
}>(files: T[], filters: FileFilters): T[] {
  let filtered = [...files];

  // Phase 5: Filter by search query (uses decrypted filename if available)
  if (filters.searchQuery && filters.searchQuery.trim()) {
    const query = filters.searchQuery.toLowerCase().trim();
    filtered = filtered.filter((file) => {
      const name = (file.decryptedFilename || file.filename).toLowerCase();
      return name.includes(query);
    });
  }

  // Filter by file type
  if (filters.fileTypes.length > 0) {
    filtered = filtered.filter((file) =>
      filters.fileTypes.includes(file.fileType)
    );
  }

  // Filter by date range
  if (filters.dateRange !== 'all') {
    const now = new Date();
    let cutoffDate: Date;

    switch (filters.dateRange) {
      case '24h':
        cutoffDate = subDays(now, 1);
        break;
      case '7d':
        cutoffDate = subDays(now, 7);
        break;
      case '30d':
        cutoffDate = subMonths(now, 1);
        break;
      case '1y':
        cutoffDate = subYears(now, 1);
        break;
      default:
        cutoffDate = new Date(0);
    }

    filtered = filtered.filter((file) => new Date(file.createdAt) >= cutoffDate);
  }

  // Filter by file size
  const sizeMultipliers = { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024 };
  const multiplier = sizeMultipliers[filters.sizeUnit];

  if (filters.minSize !== undefined) {
    filtered = filtered.filter((file) => file.size >= filters.minSize! * multiplier);
  }

  if (filters.maxSize !== undefined) {
    filtered = filtered.filter((file) => file.size <= filters.maxSize! * multiplier);
  }

  // Sort
  filtered.sort((a, b) => {
    let comparison = 0;

    switch (filters.sortBy) {
      case 'name':
        comparison = (a.decryptedFilename || a.filename).localeCompare(b.decryptedFilename || b.filename);
        break;
      case 'date':
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
      case 'size':
        comparison = a.size - b.size;
        break;
      case 'type':
        comparison = a.fileType.localeCompare(b.fileType);
        break;
    }

    return filters.sortOrder === 'asc' ? comparison : -comparison;
  });

  return filtered;
}
