interface TruncatedTextProps {
  text: string | null | undefined;
  maxLength?: number;
  preserveNumbers?: boolean;
}

export default function TruncatedText({ text, maxLength = 32, preserveNumbers = true }: TruncatedTextProps) {
  if (!text) return null;

  // Don't truncate numbers if preserveNumbers is true
  if (preserveNumbers && !isNaN(Number(text.replace(/,/g, '')))) {
    return <span className="text-sm text-gray-900">{text}</span>;
  }

  const shouldTruncate = text.length > maxLength;
  const displayText = shouldTruncate ? `${text.substring(0, maxLength)}...` : text;

  const handleCopy = () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        // Use Clipboard API if available and in secure context
        navigator.clipboard.writeText(text).catch(err => {
          console.error('Clipboard API failed:', err);
          fallbackCopyText(text);
        });
      } else {
        // Fallback for browsers without Clipboard API
        fallbackCopyText(text);
      }
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const fallbackCopyText = (text: string) => {
    // Create temporary textarea
    const textArea = document.createElement('textarea');
    textArea.value = text;
    
    // Avoid scrolling to bottom
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      document.execCommand('copy');
    } catch (err) {
      console.error('Fallback copy failed:', err);
    }

    document.body.removeChild(textArea);
  };

  if (!shouldTruncate) {
    return <span className="text-sm text-gray-900" title={text}>{text}</span>;
  }

  return (
    <div className="flex items-center space-x-2 group">
      <span className="text-sm text-gray-900" title={text}>{displayText}</span>
      <button
        onClick={handleCopy}
        className="invisible group-hover:visible p-1 text-gray-500 hover:text-gray-900 focus:outline-none"
        title="Copy full text"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
        </svg>
      </button>
    </div>
  );
}
