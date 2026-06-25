import type { CSSProperties } from 'react';

interface AppLogoProps {
  className?: string;
  alt?: string;
  style?: CSSProperties;
  forceTheme?: 'dark' | 'light';
}

export function AppLogo({ className, alt = 'Arco CRM', style, forceTheme }: AppLogoProps) {
  void forceTheme;

  return <img src="/logo_512.png" alt={alt} className={className} style={style} />;
}
