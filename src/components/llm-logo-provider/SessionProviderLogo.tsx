import type { LLMProvider } from '../../types/app';
import { baseProviderOf } from '../../lib/provider-id';
import ClaudeLogo from './ClaudeLogo';
import CodexLogo from './CodexLogo';
import CursorLogo from './CursorLogo';
import GeminiLogo from './GeminiLogo';
import OpenCodeLogo from './OpenCodeLogo';

type SessionProviderLogoProps = {
  provider?: LLMProvider | string | null;
  className?: string;
};

export default function SessionProviderLogo({
  provider = 'claude',
  className = 'w-5 h-5',
}: SessionProviderLogoProps) {
  const base = baseProviderOf(provider ?? 'claude');

  if (base === 'cursor') {
    return <CursorLogo className={className} />;
  }

  if (base === 'codex') {
    return <CodexLogo className={className} />;
  }

  if (base === 'gemini') {
    return <GeminiLogo className={className} />;
  }

  if (base === 'opencode') {
    return <OpenCodeLogo className={className} />;
  }

  return <ClaudeLogo className={className} />;
}
