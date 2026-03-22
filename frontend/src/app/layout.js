import './globals.css';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/context/AuthContext';
import KeepAlive from '@/components/KeepAlive';
const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'AgniShakti',
  description: 'Intelligent Fire Safety, Instant Peace of Mind.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <KeepAlive />
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}