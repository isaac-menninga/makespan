type ComingSoonPageProps = {
  title: string
}

export function ComingSoonPage({ title }: ComingSoonPageProps) {
  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <p className="text-slate-600">{title} is coming in a later phase.</p>
    </main>
  )
}
