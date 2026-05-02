export function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
      <div className="flex items-center justify-center size-14 rounded-2xl bg-muted">
        <Icon className="size-7 text-muted-foreground" />
      </div>
      <div>
        <p className="font-medium text-sm">{title}</p>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </div>
    </div>
  )
}
