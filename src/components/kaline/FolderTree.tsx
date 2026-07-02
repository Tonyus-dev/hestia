export function FolderTree({ text }: { text: string }) {
  return (
    <div className="kaline-glass p-5">
      <p className="kaline-eyebrow mb-3">Estrutura no HD</p>
      <pre className="text-[12.5px] leading-6 text-[color:var(--kaline-muted)] font-mono whitespace-pre overflow-x-auto">
        {text}
      </pre>
    </div>
  );
}
