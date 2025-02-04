import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from './hooks/useAuth';
import Navbar from './components/Navbar';

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "WeStudy - AI Learning Assistant",
  description: "Your personal AI-powered learning assistant for competitive exams",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <Navbar />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
