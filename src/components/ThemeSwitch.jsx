// src/components/ThemeSwitch.jsx
import { useRef } from 'react';
import { useTheme } from '../theme/useTheme';

const OPTIONS = [
  { mode: 'light', label: 'Light', title: 'Light theme' },
  { mode: 'dark', label: 'Dark', title: 'Dark theme' },
  { mode: 'system', label: 'System', title: 'Follow the operating system setting' },
];

/**
 * Light / Dark / System toggle in the app header (visible on every tab). The choice is remembered
 * per viewer (src/theme/theme.js); System follows prefers-color-scheme live.
 * Keyboard: the ARIA radiogroup pattern - one Tab stop (the checked option), arrow keys move and
 * select (wrapping), Home / End jump to the first / last option.
 */
const ThemeSwitch = () => {
  const { mode, theme, setMode } = useTheme();
  const buttonsRef = useRef([]);

  const select = (index) => {
    const next = (index + OPTIONS.length) % OPTIONS.length;
    setMode(OPTIONS[next].mode);
    buttonsRef.current[next]?.focus();
  };

  const onKeyDown = (event, index) => {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        select(index + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        select(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        select(0);
        break;
      case 'End':
        event.preventDefault();
        select(OPTIONS.length - 1);
        break;
      default:
    }
  };

  return (
    <div className="theme-switch" role="radiogroup" aria-label="Colour theme" data-testid="theme-switch" data-theme-shown={theme}>
      {OPTIONS.map((option, index) => {
        const checked = mode === option.mode;
        return (
          <button
            key={option.mode}
            ref={el => { buttonsRef.current[index] = el; }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            className={`theme-switch__btn${checked ? ' theme-switch__btn--active' : ''}`}
            title={option.mode === 'system' ? `${option.title} (now ${theme})` : option.title}
            onClick={() => setMode(option.mode)}
            onKeyDown={event => onKeyDown(event, index)}
            data-testid={`theme-${option.mode}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
};

export default ThemeSwitch;
