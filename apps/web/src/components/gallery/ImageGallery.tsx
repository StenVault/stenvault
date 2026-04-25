/**
 * ImageGallery Component
 *
 * Design System: Obsidian Vault
 * Masonry grid layout for image files with lightbox preview.
 */

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download,
  Share2,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  MoreVertical,
} from 'lucide-react';
import { Button } from '@stenvault/shared/ui/button';
import { Badge } from '@stenvault/shared/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@stenvault/shared/utils';
import { format } from 'date-fns';
import { useLongPress } from '@/hooks/useLongPress';
import { useHaptic } from '@/hooks/useGestures';
import { ActionSheet, useActionSheet } from '@/components/ui/action-sheet';
import { SelectionCheckbox, useBatchSelection } from '@/components/files/BatchActions';

interface ImageFile {
  id: number;
  filename: string;
  mimeType: string | null;
  size: number;
  createdAt: Date;
  url?: string;
}

interface ImageGalleryProps {
  images: ImageFile[];
  onDownload?: (image: ImageFile) => void;
  onShare?: (image: ImageFile) => void;
  onDelete?: (image: ImageFile) => void;
  onImageClick?: (image: ImageFile) => void;
  className?: string;
}

/**
 * Main Gallery Component - Masonry Grid
 */
export function ImageGallery({
  images,
  onDownload,
  onShare,
  onDelete,
  onImageClick,
  className,
}: ImageGalleryProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const { selectedFiles, selectionMode, toggleFile, clearSelection, enterSelectionMode } = useBatchSelection();
  const actionSheet = useActionSheet();
  const { medium } = useHaptic();

  const handleImageClick = (index: number) => {
    const image = images[index];
    if (!image) return;

    if (selectionMode) {
      toggleFile(image.id);
    } else {
      setCurrentIndex(index);
      setLightboxOpen(true);
      onImageClick?.(image);
    }
  };

  const handleLongPress = (image: ImageFile, index: number) => {
    medium();
    if (!selectionMode) {
      enterSelectionMode(image.id);
    } else {
      // Show action sheet
      actionSheet.show({
        title: image.filename,
        actions: [
          {
            label: 'Download',
            icon: <Download className="w-5 h-5" />,
            onClick: () => onDownload?.(image),
          },
          {
            label: 'Share',
            icon: <Share2 className="w-5 h-5" />,
            onClick: () => onShare?.(image),
          },
          {
            label: 'Delete',
            icon: <Trash2 className="w-5 h-5" />,
            onClick: () => onDelete?.(image),
            variant: 'destructive' as const,
          },
        ],
      });
    }
  };

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % images.length);
  }, [images.length]);

  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  }, [images.length]);

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="p-4 rounded-full bg-secondary mb-4">
          <svg className="w-8 h-8 text-foreground-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="font-display text-lg text-foreground mb-2">No images</h3>
        <p className="text-sm text-foreground-muted">
          Images you upload will appear here
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Masonry Grid */}
      <div
        className={cn(
          "grid gap-3 md:gap-4",
          "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5",
          "auto-rows-[200px]",
          className
        )}
      >
        {images.map((image, index) => (
          <GalleryItem
            key={image.id}
            image={image}
            index={index}
            selected={selectedFiles.has(image.id)}
            selectionMode={selectionMode}
            onClick={() => handleImageClick(index)}
            onLongPress={() => handleLongPress(image, index)}
            onDownload={onDownload}
            onShare={onShare}
            onDelete={onDelete}
          />
        ))}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxOpen && (
          <Lightbox
            images={images}
            currentIndex={currentIndex}
            onClose={() => setLightboxOpen(false)}
            onNext={handleNext}
            onPrev={handlePrev}
            onDownload={onDownload}
            onShare={onShare}
            onDelete={onDelete}
          />
        )}
      </AnimatePresence>

      {/* Action Sheet */}
      <ActionSheet
        open={actionSheet.isOpen}
        onClose={actionSheet.hide}
        title={actionSheet.title}
        description={actionSheet.description}
        actions={actionSheet.actions}
      />
    </>
  );
}

/**
 * Individual Gallery Item
 */
interface GalleryItemProps {
  image: ImageFile;
  index: number;
  selected?: boolean;
  selectionMode?: boolean;
  onClick: () => void;
  onLongPress?: () => void;
  onDownload?: (image: ImageFile) => void;
  onShare?: (image: ImageFile) => void;
  onDelete?: (image: ImageFile) => void;
}

function GalleryItem({
  image,
  index,
  selected = false,
  selectionMode = false,
  onClick,
  onLongPress,
  onDownload,
  onShare,
  onDelete,
}: GalleryItemProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const longPressHandlers = useLongPress({
    onLongPress: () => onLongPress?.(),
    duration: 500,
    haptic: true,
  });

  // Random height for masonry effect
  const heights = ['row-span-1', 'row-span-2', 'row-span-1', 'row-span-2'];
  const heightClass = heights[index % heights.length];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, delay: index * 0.03 }}
      className={cn(
        "group relative overflow-hidden rounded-lg cursor-pointer",
        "border bg-card",
        "hover:shadow-lg hover:shadow-primary/10",
        "transition-all duration-300",
        selected
          ? "border-primary shadow-lg shadow-primary/20 scale-95"
          : "border-border hover:border-primary/50",
        heightClass
      )}
      onClick={onClick}
      {...longPressHandlers}
    >
      {/* Selection Checkbox */}
      {selectionMode && (
        <div className="absolute top-2 left-2 z-10">
          <SelectionCheckbox
            selected={selected}
            onToggle={onClick}
          />
        </div>
      )}
      {/* Image */}
      {!imageError ? (
        <>
          {!imageLoaded && (
            <div className="absolute inset-0 animate-pulse bg-secondary" />
          )}
          <img
            src={image.url || `/api/files/${image.id}/thumbnail`}
            alt={image.filename}
            className={cn(
              "w-full h-full object-cover",
              "transition-transform duration-300",
              "group-hover:scale-105",
              !imageLoaded && "opacity-0"
            )}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
            loading="lazy"
          />
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-secondary">
          <svg className="w-8 h-8 text-foreground-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      )}

      {/* Overlay on hover */}
      <div className={cn(
        "absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent",
        "opacity-0 group-hover:opacity-100",
        "transition-opacity duration-300"
      )}>
        {/* File info */}
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <p className="text-white text-sm font-medium truncate mb-1">
            {image.filename}
          </p>
          <div className="flex items-center justify-between">
            <span className="text-white/70 text-xs">
              {format(new Date(image.createdAt), 'dd MMM yyyy')}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-white hover:bg-white/20"
                >
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onDownload && (
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDownload(image); }}>
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </DropdownMenuItem>
                )}
                {onShare && (
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onShare(image); }}>
                    <Share2 className="w-4 h-4 mr-2" />
                    Share
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <DropdownMenuItem
                    onClick={(e) => { e.stopPropagation(); onDelete(image); }}
                    className="text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Deletar
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Lightbox Component with Gestures
 */
interface LightboxProps {
  images: ImageFile[];
  currentIndex: number;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  onDownload?: (image: ImageFile) => void;
  onShare?: (image: ImageFile) => void;
  onDelete?: (image: ImageFile) => void;
}

function Lightbox({
  images,
  currentIndex,
  onClose,
  onNext,
  onPrev,
  onDownload,
  onShare,
  onDelete,
}: LightboxProps) {
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const imageRef = useRef<HTMLDivElement>(null);
  const currentImage = images[currentIndex];
  if (!currentImage) return null;

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.5, 3));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.5, 1));
  const resetZoom = () => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  };

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') onPrev();
    if (e.key === 'ArrowRight') onNext();
    if (e.key === 'Escape') onClose();
  }, [onPrev, onNext, onClose]);

  useState(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-medium truncate">{currentImage.filename}</h3>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary" size="sm">
                {currentIndex + 1} / {images.length}
              </Badge>
              <span className="text-white/70 text-sm">
                {format(new Date(currentImage.createdAt), 'dd MMM yyyy')}
              </span>
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-white hover:bg-white/20"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Main Image */}
      <div className="absolute inset-0 flex items-center justify-center p-4 pt-24 pb-20">
        <motion.div
          ref={imageRef}
          drag={zoom > 1}
          dragConstraints={{ left: -100, right: 100, top: -100, bottom: 100 }}
          style={{ scale: zoom, x: position.x, y: position.y }}
          className="relative max-w-full max-h-full"
          onClick={(e) => e.stopPropagation()}
        >
          <motion.img
            key={currentIndex}
            src={currentImage.url || `/api/files/${currentImage.id}/preview`}
            alt={currentImage.filename}
            className="max-w-full max-h-full object-contain"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          />
        </motion.div>
      </div>

      {/* Navigation Arrows */}
      {images.length > 1 && (
        <>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); onPrev(); resetZoom(); }}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 w-12 h-12"
          >
            <ChevronLeft className="w-6 h-6" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); onNext(); resetZoom(); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 w-12 h-12"
          >
            <ChevronRight className="w-6 h-6" />
          </Button>
        </>
      )}

      {/* Bottom Toolbar */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-4 bg-gradient-to-t from-black/80 to-transparent">
        <div className="flex items-center justify-center gap-2 max-w-7xl mx-auto">
          {/* Zoom controls */}
          <div className="flex items-center gap-1 bg-black/50 rounded-lg p-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => { e.stopPropagation(); handleZoomOut(); }}
              disabled={zoom <= 1}
              className="text-white hover:bg-white/20"
            >
              <ZoomOut className="w-4 h-4" />
            </Button>
            <span className="text-white text-sm px-2 min-w-[60px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => { e.stopPropagation(); handleZoomIn(); }}
              disabled={zoom >= 3}
              className="text-white hover:bg-white/20"
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 bg-black/50 rounded-lg p-1">
            {onDownload && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => { e.stopPropagation(); onDownload(currentImage); }}
                className="text-white hover:bg-white/20"
              >
                <Download className="w-4 h-4" />
              </Button>
            )}
            {onShare && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => { e.stopPropagation(); onShare(currentImage); }}
                className="text-white hover:bg-white/20"
              >
                <Share2 className="w-4 h-4" />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => { e.stopPropagation(); onDelete(currentImage); }}
                className="text-white hover:bg-white/20 hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
