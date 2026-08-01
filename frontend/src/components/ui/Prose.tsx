import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function Prose({ markdown }: { markdown: string }) {
  return (
    <div className="space-y-4 text-[15px] leading-relaxed text-ink-600">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-3xl font-bold tracking-tight text-ink-800 sm:text-4xl">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="!mt-10 border-t border-stone-200 pt-8 text-xl font-semibold text-ink-800">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="!mt-6 text-base font-semibold text-ink-800">{children}</h3>
          ),
          p: ({ children }) => <p>{children}</p>,
          ul: ({ children }) => <ul className="list-disc space-y-1.5 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1.5 pl-5">{children}</ol>,
          strong: ({ children }) => <strong className="font-semibold text-ink-800">{children}</strong>,
          a: ({ href, children }) => (
            <a href={href} className="font-medium text-brand-700 underline underline-offset-2">{children}</a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="rounded-lg border-l-4 border-brand-500 bg-brand-50 px-4 py-3">{children}</blockquote>
          ),
          hr: () => <hr className="!my-10 border-stone-200" />,
          // Tabelas precisam rolar sozinhas: o corpo da pagina nunca
          // deve rolar na horizontal no celular.
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-stone-200 bg-stone-50 px-3 py-2 text-left font-semibold text-ink-800">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border border-stone-200 px-3 py-2 align-top">{children}</td>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
