export default function EmptyState({
  title,
  subtitle,
  icon,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center justify-center gap-3 p-10 text-center">
      <div className="rounded-full bg-steel-100 p-4 text-steel-400 dark:bg-steel-800 dark:text-steel-300">
        {icon ?? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="h-8 w-8"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 9.75h16.5M3.75 6.75h16.5m-16.5 6h16.5m-16.5 3h10.5"
            />
          </svg>
        )}
      </div>
      <h3 className="text-lg font-semibold text-ink dark:text-paper">{title}</h3>
      {subtitle && (
        <p className="max-w-md text-sm text-steel-500 dark:text-steel-300">
          {subtitle}
        </p>
      )}
    </div>
  );
}
