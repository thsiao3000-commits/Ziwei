import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * 模型回覆的 Markdown 呈現。不渲染原始 HTML（react-markdown 預設就不渲染，
 * 這裡也不加 rehype-raw），不載入圖片，連結一律另開分頁。
 */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="reading-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        disallowedElements={['img']}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
