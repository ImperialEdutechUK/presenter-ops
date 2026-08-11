export interface PageParams {
  page: number;
  pageSize: number;
}

export function toSkipTake({ page, pageSize }: PageParams) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function paginate<T>(data: T[], total: number, { page, pageSize }: PageParams) {
  return {
    data,
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}
