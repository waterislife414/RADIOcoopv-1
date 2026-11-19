import Link from 'next/link';
import type { ComponentProps } from 'react';

type Variant = 'primary' | 'dark' | 'outline' | 'outlineLight' | 'ghost' | 'success';
type Size = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 select-none';
const variants: Record<Variant, string> = {
  primary: 'bg-amber-500 text-slate-900 hover:bg-amber-400 active:bg-amber-600 shadow-sm shadow-amber-900/20',
  dark: 'bg-slate-900 text-white hover:bg-slate-800',
  outline: 'border-2 border-slate-900 text-slate-900 hover:bg-slate-900 hover:text-white',
  outlineLight: 'border-2 border-white/70 text-white hover:bg-white hover:text-slate-900',
  ghost: 'text-slate-700 hover:bg-slate-100',
  success: 'bg-emerald-500 text-white hover:bg-emerald-600',
};
const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-5 text-[15px]',
  lg: 'h-14 px-6 text-base',
};

export function buttonClasses(variant: Variant = 'primary', size: Size = 'md', extra = ''): string {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`.trim();
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ComponentProps<'button'> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClasses(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />;
}
