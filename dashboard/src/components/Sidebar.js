'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Sidebar() {
  const pathname = usePathname();

  const links = [
    { href: '/', label: 'Overview' },
    { href: '/callbacks', label: 'Callback Reports' },
    { href: '/recipients', label: 'SMS History' }
  ];

  return (
    <aside className="sidebar">
      <h1>MSG91 Analytics</h1>
      <nav className="nav-links">
        {links.map(link => {
          const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
          return (
            <Link 
              key={link.href} 
              href={link.href}
              className={`nav-link ${isActive ? 'active' : ''}`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
