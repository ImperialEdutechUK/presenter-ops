'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  AssignmentDetailDto,
  AssignmentSummaryDto,
  BrandDto,
  DashboardDto,
  Paginated,
  PresenterDetailDto,
  PresenterSummaryDto,
  UserDto,
  WorkloadSummary,
} from '@presenter-ops/shared';

import { api, ApiRequestError } from './api';

/**
 * Query keys are structured so an invalidation can be as broad or as narrow as
 * the mutation actually requires:
 *   ['assignments']                 → everything
 *   ['assignments', 'list', filters] → one filtered list
 *   ['assignments', 'detail', id]    → one record
 */
export const keys = {
  me: ['me'] as const,
  brands: ['brands'] as const,
  workTypes: ['work-types'] as const,
  tags: ['tags'] as const,
  dashboard: (range?: string) => ['dashboard', range ?? '30d'] as const,
  workload: (params: unknown) => ['workload', params] as const,
  presenters: {
    all: ['presenters'] as const,
    list: (params: unknown) => ['presenters', 'list', params] as const,
    detail: (id: string) => ['presenters', 'detail', id] as const,
    feedback: (id: string) => ['presenters', 'feedback', id] as const,
    performance: (id: string) => ['presenters', 'performance', id] as const,
  },
  assignments: {
    all: ['assignments'] as const,
    list: (params: unknown) => ['assignments', 'list', params] as const,
    detail: (id: string) => ['assignments', 'detail', id] as const,
  },
  notifications: ['notifications'] as const,
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const useMe = () =>
  useQuery({
    queryKey: keys.me,
    queryFn: () => api.get<UserDto>('/auth/me'),
    retry: false,
    staleTime: 5 * 60_000,
  });

export const useBrands = () =>
  useQuery({
    queryKey: keys.brands,
    queryFn: () => api.get<BrandDto[]>('/brands'),
    // Brands change rarely; caching them keeps the combobox instant.
    staleTime: 10 * 60_000,
  });

export const useWorkTypes = () =>
  useQuery({
    queryKey: keys.workTypes,
    queryFn: () => api.get<{ id: string; name: string }[]>('/work-types'),
    staleTime: 10 * 60_000,
  });

export const useDashboard = (range?: { from?: string; to?: string }) =>
  useQuery({
    queryKey: keys.dashboard(range?.from),
    queryFn: () => api.get<DashboardDto>('/analytics/dashboard', range),
    // The dashboard is a glanceable summary — refresh it while the tab is open.
    refetchInterval: 120_000,
  });

export const useWorkload = (params: {
  from?: string;
  to?: string;
  brandId?: string[];
  includeInactive?: boolean;
}) =>
  useQuery({
    queryKey: keys.workload(params),
    queryFn: () => api.get<WorkloadSummary>('/analytics/workload', params),
  });

export const usePresenters = (params: Record<string, unknown>) =>
  useQuery({
    queryKey: keys.presenters.list(params),
    queryFn: () => api.get<Paginated<PresenterSummaryDto>>('/presenters', params as never),
    placeholderData: (previous) => previous, // no flash of empty state while filtering
  });

export const usePresenter = (id: string, options?: Partial<UseQueryOptions<PresenterDetailDto>>) =>
  useQuery({
    queryKey: keys.presenters.detail(id),
    queryFn: () => api.get<PresenterDetailDto>(`/presenters/${id}`),
    enabled: Boolean(id),
    ...options,
  });

export const useAssignments = (params: Record<string, unknown>) =>
  useQuery({
    queryKey: keys.assignments.list(params),
    queryFn: () => api.get<Paginated<AssignmentSummaryDto>>('/assignments', params as never),
    placeholderData: (previous) => previous,
  });

export const useAssignment = (id: string) =>
  useQuery({
    queryKey: keys.assignments.detail(id),
    queryFn: () => api.get<AssignmentDetailDto>(`/assignments/${id}`),
    enabled: Boolean(id),
  });

export const useSuggestedPresenters = (params: {
  brandId?: string;
  workTypeId?: string;
  dueAt?: string;
}) =>
  useQuery({
    queryKey: ['suggest-presenters', params],
    queryFn: () => api.get<any>('/analytics/suggest-presenters', params),
    enabled: Boolean(params.brandId),
  });

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** Surfaces the API's own message rather than a generic "something went wrong". */
function reportError(error: unknown, fallback: string) {
  if (error instanceof ApiRequestError) {
    const firstField = error.fieldErrors && Object.values(error.fieldErrors)[0]?.[0];
    toast.error(error.message, { description: firstField });
    return;
  }
  toast.error(fallback);
}

export function useCreatePresenter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: unknown) => api.post<PresenterDetailDto>('/presenters', input),
    onSuccess: (presenter) => {
      queryClient.invalidateQueries({ queryKey: keys.presenters.all });
      queryClient.invalidateQueries({ queryKey: keys.brands }); // new brands may exist now
      toast.success(`${presenter.displayName} added`);
    },
    onError: (error) => reportError(error, 'Could not save the presenter.'),
  });
}

export function useUpdatePresenter(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: unknown) => api.patch<PresenterDetailDto>(`/presenters/${id}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.presenters.all });
      toast.success('Saved');
    },
    onError: (error) => reportError(error, 'Could not save the changes.'),
  });
}

export function useCreateAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: unknown) => api.post<AssignmentSummaryDto>('/assignments', input),
    onSuccess: (assignment) => {
      queryClient.invalidateQueries({ queryKey: keys.assignments.all });
      queryClient.invalidateQueries({ queryKey: ['workload'] });
      toast.success(`${assignment.reference} created`);
    },
    onError: (error) => reportError(error, 'Could not create the assignment.'),
  });
}

/**
 * Status changes update the cache optimistically — the board column moves the
 * instant you click, and rolls back if the server disagrees. On a board you
 * drag things across, waiting 300ms for confirmation feels broken.
 */
export function useTransitionAssignment(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { to: string; deliveryUrl?: string; note?: string }) =>
      api.post<AssignmentDetailDto>(`/assignments/${id}/transition`, input),

    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: keys.assignments.detail(id) });
      const previous = queryClient.getQueryData<AssignmentDetailDto>(keys.assignments.detail(id));
      if (previous) {
        queryClient.setQueryData(keys.assignments.detail(id), {
          ...previous,
          status: input.to,
        });
      }
      return { previous };
    },

    onError: (error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(keys.assignments.detail(id), context.previous);
      }
      reportError(error, 'Could not update the status.');
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: keys.assignments.all });
      queryClient.invalidateQueries({ queryKey: keys.presenters.all });
      queryClient.invalidateQueries({ queryKey: ['workload'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useSaveFeedback(assignmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: unknown) => api.post(`/assignments/${assignmentId}/feedback`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.assignments.detail(assignmentId) });
      queryClient.invalidateQueries({ queryKey: keys.presenters.all });
      toast.success('Feedback saved');
    },
    onError: (error) => reportError(error, 'Could not save the feedback.'),
  });
}

export function useRecordPerformance(assignmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: unknown) => api.post(`/assignments/${assignmentId}/performance`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.assignments.detail(assignmentId) });
      toast.success('Performance figures recorded');
    },
    onError: (error) => reportError(error, 'Could not record the figures.'),
  });
}
