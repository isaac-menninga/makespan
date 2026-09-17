import type { RouteObject } from 'react-router'
import { GalleryPage } from './gallery/GalleryPage'
import { BuilderPage } from './builder/BuilderPage'

export const routes: RouteObject[] = [
  { path: '/', element: <GalleryPage /> },
  { path: '/problems/new', element: <BuilderPage /> },
  { path: '/problems/:id', element: <BuilderPage /> },
]
