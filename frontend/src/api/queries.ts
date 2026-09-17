import { useMutation, useQuery } from '@tanstack/react-query'
import { apiClient } from './client'
import type { components } from './schema'

type ProblemIn = components['schemas']['ProblemIn']

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
  return useMutation({
    mutationFn: async (problem: ProblemIn) => {
      const { data, error } = await apiClient.POST('/api/problems', { body: problem })
      if (error || !data) throw error || new Error('Failed to create problem')
      return data
    },
  })
}

export function useUpdateProblem(id: string) {
  return useMutation({
    mutationFn: async (problem: ProblemIn) => {
      const { data, error } = await apiClient.PUT('/api/problems/{problem_id}', {
        params: { path: { problem_id: id } },
        body: problem,
      })
      if (error || !data) throw error || new Error('Failed to update problem')
      return data
    },
  })
}
