import { useState, useMemo } from 'react';

export interface PaginationState {
  currentPage: number;
  itemsPerPage: number;
  totalItems: number;
  totalPages: number;
}

export interface UsePaginationReturn<T> {
  currentPage: number;
  setCurrentPage: (page: number) => void;
  itemsPerPage: number;
  setItemsPerPage: (count: number) => void;
  paginatedItems: T[];
  totalPages: number;
  totalItems: number;
  canGoNext: boolean;
  canGoPrev: boolean;
  goNext: () => void;
  goPrev: () => void;
}

export function usePagination<T>(items: T[], defaultItemsPerPage = 10): UsePaginationReturn<T> {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(defaultItemsPerPage);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

  // Ensure current page is valid
  if (currentPage > totalPages && totalPages > 0) {
    setCurrentPage(totalPages);
  }

  const paginatedItems = useMemo(() => {
    const startIdx = (currentPage - 1) * itemsPerPage;
    const endIdx = startIdx + itemsPerPage;
    return items.slice(startIdx, endIdx);
  }, [items, currentPage, itemsPerPage]);

  const canGoNext = currentPage < totalPages;
  const canGoPrev = currentPage > 1;

  const goNext = () => {
    if (canGoNext) {
      setCurrentPage(currentPage + 1);
    }
  };

  const goPrev = () => {
    if (canGoPrev) {
      setCurrentPage(currentPage - 1);
    }
  };

  return {
    currentPage,
    setCurrentPage,
    itemsPerPage,
    setItemsPerPage,
    paginatedItems,
    totalPages,
    totalItems,
    canGoNext,
    canGoPrev,
    goNext,
    goPrev,
  };
}
