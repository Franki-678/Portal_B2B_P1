'use client';

import { useEffect, useCallback, useState } from 'react';
import { cn } from '@/lib/utils';

export interface ImageLightboxProps {
  /** URLs a mostrar (vacío = cerrado) */
  images: string[];
  /** Índice inicial al abrir */
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
}

export function ImageLightbox({
  images,
  initialIndex = 0,
  isOpen,
  onClose,
}: ImageLightboxProps) {
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (isOpen) setIndex(Math.min(Math.max(0, initialIndex), Math.max(0, images.length - 1)));
  }, [isOpen, initialIndex, images.length]);

  const go = useCallback(
    (delta: number) => {
      if (images.length <= 1) return;
      setIndex(i => (i + delta + images.length) % images.length);
    },
    [images.length]
  );

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, go]);

  if (!isOpen || images.length === 0) return null;

  const url = images[index];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8"
      role="dialog"
      aria-modal="true"
      aria-label="Vista ampliada de imagen"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        aria-label="Cerrar"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[90vh] max-w-[min(100vw-2rem,1200px)] w-full flex-col items-center gap-4">
        <div className="flex w-full items-center justify-end gap-2">
          <span className="mr-auto text-xs font-medium text-zinc-400">
            {images.length > 1 ? `${index + 1} / ${images.length}` : ''}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-600 bg-zinc-900 text-lg text-zinc-200 shadow-lg hover:bg-zinc-800"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="relative flex w-full flex-1 items-center justify-center">
          {images.length > 1 && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                go(-1);
              }}
              className={cn(
                'absolute left-0 z-20 flex h-12 w-12 items-center justify-center rounded-full border border-zinc-600 bg-zinc-900/90 text-xl text-zinc-100 shadow-lg hover:bg-zinc-800 md:-left-4'
              )}
              aria-label="Imagen anterior"
            >
              ‹
            </button>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt=""
            className="max-h-[min(75vh,800px)] max-w-full object-contain rounded-lg border border-zinc-700/50 shadow-2xl"
          />
          {images.length > 1 && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                go(1);
              }}
              className="absolute right-0 z-20 flex h-12 w-12 items-center justify-center rounded-full border border-zinc-600 bg-zinc-900/90 text-xl text-zinc-100 shadow-lg hover:bg-zinc-800 md:-right-4"
              aria-label="Imagen siguiente"
            >
              ›
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Hook para abrir el lightbox desde listas de URLs */
export function useImageLightbox() {
  const [state, setState] = useState<{ urls: string[]; index: number } | null>(null);

  const open = useCallback((urls: string[], index = 0) => {
    const list = urls.filter(Boolean);
    if (list.length === 0) return;
    setState({ urls: list, index: Math.min(Math.max(0, index), list.length - 1) });
  }, []);

  const close = useCallback(() => setState(null), []);

  const node = (
    <ImageLightbox
      images={state?.urls ?? []}
      initialIndex={state?.index ?? 0}
      isOpen={!!state}
      onClose={close}
    />
  );

  return { open, close, node };
}
