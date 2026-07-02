export function EndpointList({
  items,
  title = "Endpoints planejados",
}: {
  items: string[];
  title?: string;
}) {
  return (
    <div className="kaline-glass p-5">
      <p className="kaline-eyebrow mb-3">{title}</p>
      <pre className="text-[12.5px] leading-6 text-[color:var(--kaline-muted)] font-mono whitespace-pre overflow-x-auto">
        {items.join("\n")}
      </pre>
    </div>
  );
}
