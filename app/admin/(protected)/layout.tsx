import type { Metadata } from 'next';
import Link from 'next/link';
import { FileText, LayoutDashboard, LogOut, QrCode, Settings, Users, Wrench } from 'lucide-react';
import { requireAdmin } from '@/lib/auth';
import { signOut } from '../login/actions';

export const metadata: Metadata = { title: 'Shop Admin', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const NAV = [
  { href: '/admin', label: 'Jobs', icon: LayoutDashboard },
  { href: '/admin/invoices', label: 'Invoices', icon: FileText },
  { href: '/admin/qr', label: 'QR Studio', icon: QrCode },
  { href: '/admin/memberships', label: 'Members', icon: Users },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireAdmin();
  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-30 bg-slate-900 text-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4">
          <Link href="/admin" className="flex items-center gap-2 font-display text-base">
            <span className="grid h-8 w-8 place-items-center rounded bg-amber-500 text-slate-900"><Wrench className="h-4 w-4" aria-hidden /></span>
            Shop Admin
          </Link>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="hidden sm:inline">{user.email}</span>
            <form action={signOut}>
              <button className="flex items-center gap-1 rounded px-2 py-1 font-bold text-slate-200 hover:bg-slate-800" aria-label="Sign out">
                <LogOut className="h-4 w-4" aria-hidden />
              </button>
            </form>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2 pb-2" aria-label="Admin">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold text-slate-300 hover:bg-slate-800 hover:text-white">
              <Icon className="h-4 w-4" aria-hidden /> {label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
