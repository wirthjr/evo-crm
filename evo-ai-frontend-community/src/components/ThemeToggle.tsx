import { Sun, Moon, Flame, Check } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@evoapi/design-system';
import { useDarkMode } from '../hooks/useDarkMode';
import type { Theme } from '../contexts/ThemeContext';

const THEME_OPTIONS: { value: Theme; icon: typeof Sun; label: string }[] = [
  { value: 'light', icon: Sun, label: 'Claro' },
  { value: 'dark', icon: Moon, label: 'Escuro' },
  { value: 'dar-red', icon: Flame, label: 'Red Neon' },
];

const currentIcon: Record<Theme, typeof Sun> = {
  light: Sun,
  dark: Moon,
  'dar-red': Flame,
};

export function ThemeToggle() {
  const { theme, setTheme } = useDarkMode();
  const Icon = currentIcon[theme];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 hover:bg-neutral-surface-highlight cursor-pointer"
          aria-label="Alternar tema"
        >
          <Icon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-40">
        {THEME_OPTIONS.map(({ value, icon: OptIcon, label }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setTheme(value)}
            className="flex items-center justify-between cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <OptIcon className="h-4 w-4" />
              {label}
            </span>
            {theme === value && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
