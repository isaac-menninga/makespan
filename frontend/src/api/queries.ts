import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from './client'
import type { components } from './schema'

type ProblemIn = components['schemas']['ProblemIn']
type SolveCreate = components['schemas']['SolveCreate']

export function usePresets() {
  return useQuery({
    queryKey: ['presets'],
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/api/presets')
      if (error || !data) throw error || new Error('Failed to load presets')
      return data
    },
  })
}

export function useSavedProblems() {
  return useQuery({
    queryKey: ['problems'],
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/api/problems')
      if (error || !data) throw error || new Error('Failed to load problems')
      return data
    },
  })
}

export function useProblem(id: string) {
  return useQuery({
    queryKey: ['problem', id],
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/api/problems/{problem_id}', {
        params: { path: { problem_id: id } },
      })
      if (error || !data) throw error || new Error('Failed to load problem')
      return data
    },
  })
}

export function useCreateProblem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (problem: ProblemIn) => {
      const { data, error } = await apiClient.POST('/api/problems', { body: problem })
      if (error || !data) throw error || new Error('Failed to create problem')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['problems'] })
    },
  })
}

export function useUpdateProblem(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (problem: ProblemIn) => {
      const { data, error } = await apiClient.PUT('/api/problems/{problem_id}', {
        params: { path: { problem_id: id } },
        body: problem,
      })
      if (error || !data) throw error || new Error('Failed to update problem')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['problems'] })
      queryClient.invalidateQueries({ queryKey: ['problem', id] })
    },
  })
}

export function getSolveRefetchInterval(status: string | undefined): number | false {
  return status === 'pending' || status === 'running' ? 1000 : false
}

export function useCreateSolve() {
  return useMutation({
    mutationFn: async (payload: SolveCreate) => {
      const { data, error } = await apiClient.POST('/api/solves', { body: payload })
      if (error || !data) throw error || new Error('Failed to start solve')
      return data
    },
  })
}

export function useSolve(id: string) {
  return useQuery({
    queryKey: ['solve', id],
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/api/solves/{solve_id}', {
        params: { path: { solve_id: id } },
      })
      if (error || !data) throw error || new Error('Failed to load solve')
      return data
    },
    refetchInterval: (query) => getSolveRefetchInterval(query.state.data?.status),
  })
}
