import './globals.css';
import Sidebar from '../components/Sidebar';

export const metadata = {
  title: 'MSG91 Analytics Dashboard',
  description: 'Analytics, Callback Reports, and SMS History',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="app-layout">
          <Sidebar />
          <main className="main-content">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
