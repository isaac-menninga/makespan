import { useQuery } from '@tanstack/react-query'
import { apiClient } from './client'

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
