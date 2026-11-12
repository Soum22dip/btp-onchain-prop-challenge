interface PageShellProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export function PageShell({ title, subtitle, children, actions }: PageShellProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-setl8 bg-surface/50 backdrop-blur-sm">
        <div>
          <h1 className="text-lg font-semibold text-white">{title}</h1>
          {subtitle && (
            <p className="text-text-secondary text-sm mt-0.5">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>
    </div>
  );
}
