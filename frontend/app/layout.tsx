import "./globals.css";

export const metadata = {
  title: "校园留言板 CampusBoard",
  description: "FHEVM 加密喝彩 · 校园主题的全新链上互动",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-[url('https://images.unsplash.com/photo-1507842217343-583bb7270b66?q=80&w=2000&auto=format&fit=crop')] bg-cover bg-fixed">
        {children}
      </body>
    </html>
  );
}


