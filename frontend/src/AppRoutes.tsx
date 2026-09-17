import type { RouteObject } from 'react-router'
import { AppShell } from './AppShell'
import { GalleryPage } from './gallery/GalleryPage'
import { BuilderPage } from './builder/BuilderPage'
import { SolvePage } from './solve/SolvePage'

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <GalleryPage /> },
      { path: '/problems/new', element: <BuilderPage /> },
      { path: '/problems/:id', element: <BuilderPage /> },
      { path: '/problems/:id/solves/:solveId', element: <SolvePage /> },
    ],
  },
]
