import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '../ThemeContext'
import { useTheme } from '../useTheme'

function ThemeConsumer() {
  const { theme, toggleTheme } = useTheme()
  return (
    <div>
      <span data-testid="current-theme">{theme}</span>
      <button onClick={toggleTheme}>Toggle Theme</button>
    </div>
  )
}

describe('ThemeContext', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  it('throws when useTheme is used outside ThemeProvider', () => {
    expect(() => render(<ThemeConsumer />)).toThrow('useTheme must be used within a ThemeProvider')
  })

  it('initializes from stored light theme and toggles to dark', async () => {
    const user = userEvent.setup()
    localStorage.setItem('scroogebank-theme', 'light')

    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    )

    expect(screen.getByTestId('current-theme')).toHaveTextContent('light')
    expect(document.documentElement).not.toHaveClass('dark')

    await user.click(screen.getByRole('button', { name: 'Toggle Theme' }))

    expect(screen.getByTestId('current-theme')).toHaveTextContent('dark')
    expect(document.documentElement).toHaveClass('dark')
    expect(localStorage.getItem('scroogebank-theme')).toBe('dark')
  })

  it('falls back to system dark preference for invalid stored values', () => {
    localStorage.setItem('scroogebank-theme', 'invalid')
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: () => ({
        matches: true,
        media: '(prefers-color-scheme: dark)',
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    })

    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    )

    expect(screen.getByTestId('current-theme')).toHaveTextContent('dark')
    expect(document.documentElement).toHaveClass('dark')
    expect(localStorage.getItem('scroogebank-theme')).toBe('dark')
  })

  it('toggles from stored dark theme back to light', async () => {
    const user = userEvent.setup()
    localStorage.setItem('scroogebank-theme', 'dark')

    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    )

    expect(screen.getByTestId('current-theme')).toHaveTextContent('dark')
    expect(document.documentElement).toHaveClass('dark')

    await user.click(screen.getByRole('button', { name: 'Toggle Theme' }))

    expect(screen.getByTestId('current-theme')).toHaveTextContent('light')
    expect(document.documentElement).not.toHaveClass('dark')
    expect(localStorage.getItem('scroogebank-theme')).toBe('light')
  })
})
