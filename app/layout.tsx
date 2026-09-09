import type { Metadata } from 'next';
import { Inter, Montserrat } from 'next/font/google';
import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

const montserrat = Montserrat({
  variable: '--font-montserrat',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Criador de Thumbnails | Clemilson Finanças',
  description: 'Crie capas padronizadas para os conteúdos da Clemilson Finanças.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark">
      <body className={`${inter.variable} ${montserrat.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
