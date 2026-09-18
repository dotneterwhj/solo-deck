'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { ThemeId, ThemeConfig, THEMES } from './types'

interface ThemeContextType {
  theme: ThemeId
  setTheme: (theme: ThemeId) => void
  currentConfig: ThemeConfig
  availableThemes: ThemeConfig[]
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

const THEME_STORAGE_KEY = 'solodeck_theme'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>('titanium')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) as ThemeId
      if (savedTheme && THEMES.some((t) => t.id === savedTheme)) {
        setThemeState(savedTheme)
        applyThemeToDOM(savedTheme)
      } else {
        applyThemeToDOM('titanium')
      }
    } catch {
      applyThemeToDOM('titanium')
    }
    setMounted(true)
  }, [])

  const applyThemeToDOM = (themeId: ThemeId) => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    root.setAttribute('data-theme', themeId)
    if (themeId === 'light') {
      root.classList.remove('dark')
      root.classList.add('light')
    } else {
      root.classList.remove('light')
      root.classList.add('dark')
    }
  }

  const setTheme = (newTheme: ThemeId) => {
    setThemeState(newTheme)
    applyThemeToDOM(newTheme)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme)
    } catch { }
  }

  const currentConfig = THEMES.find((t) => t.id === theme) || THEMES[0]

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        currentConfig,
        availableThemes: THEMES,
      }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
