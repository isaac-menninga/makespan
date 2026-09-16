import { Route, Routes } from 'react-router'
import { ComingSoonPage } from './routes/ComingSoonPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<ComingSoonPage title="The gallery" />} />
      <Route path="/problems/new" element={<ComingSoonPage title="The problem builder" />} />
      <Route path="/problems/:id" element={<ComingSoonPage title="The problem builder" />} />
    </Routes>
  )
}
