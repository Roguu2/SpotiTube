import type { ComponentPropsWithRef, ReactNode } from 'react'
import { cx } from '@/lib/format'

interface IconButtonProps extends ComponentPropsWithRef<'button'> {
  label: string
  active?: boolean
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
}

export function IconButton({ label, active = false, size = 'md', className, children, ...rest }: IconButtonProps) {
  const sizes = { sm: 'size-7', md: 'size-8', lg: 'size-10' }
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full transition-colors disabled:pointer-events-none disabled:opacity-35',
        active ? 'text-spotify hover:text-spotify/80' : 'text-zinc-400 hover:bg-white/8 hover:text-zinc-100',
        sizes[size],
        className
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  children: ReactNode
}

export function Button({ variant = 'secondary', size = 'md', className, children, ...rest }: ButtonProps) {
  const variants = {
    primary: 'bg-zinc-100 text-zinc-950 hover:bg-white',
    secondary: 'bg-white/8 text-zinc-100 ring-1 ring-inset ring-white/10 hover:bg-white/12',
    ghost: 'text-zinc-300 hover:bg-white/8 hover:text-zinc-100',
    danger: 'bg-red-500/15 text-red-300 ring-1 ring-inset ring-red-500/30 hover:bg-red-500/25'
  }
  const sizes = { sm: 'h-7 px-2.5 text-xs gap-1.5', md: 'h-9 px-3.5 text-sm gap-2' }
  return (
    <button
      type="button"
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-40',
        variants[variant],
        sizes[size],
        className
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
