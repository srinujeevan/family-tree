export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  pagination: Pagination;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
