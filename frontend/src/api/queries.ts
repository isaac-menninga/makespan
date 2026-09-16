import { useQuery } from '@tanstack/react-query'
import { apiClient } from './client'

export function usePresets() {
  return useQuery({
    queryKey: ['presets'],
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/api/presets')
      if (error) throw error
      return data
    },
  })
}

export function useSavedProblems() {
  return useQuery({
    queryKey: ['problems'],
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/api/problems')
      if (error) throw error
      return data
    },
  })
}
