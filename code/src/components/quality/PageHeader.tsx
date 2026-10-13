export function PageHeader({ title, description, actions }: { title: string; description: string; actions?: React.ReactNode }) {
  return <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
    <div><h1 className="text-2xl font-bold tracking-tight text-slate-950">{title}</h1><p className="mt-1 text-sm text-slate-500">{description}</p></div>
    {actions && <div className="flex items-center gap-2">{actions}</div>}
  </div>;
}
