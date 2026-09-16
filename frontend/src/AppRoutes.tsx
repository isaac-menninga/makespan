import { Route, Routes } from 'react-router'
import { ComingSoonPage } from './routes/ComingSoonPage'
import { GalleryPage } from './gallery/GalleryPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<GalleryPage />} />
      <Route path="/problems/new" element={<ComingSoonPage title="The problem builder" />} />
      <Route path="/problems/:id" element={<ComingSoonPage title="The problem builder" />} />
    </Routes>
  )
}
