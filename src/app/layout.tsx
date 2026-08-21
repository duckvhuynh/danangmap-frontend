import type { Metadata, Viewport } from "next";
import { Roboto } from "next/font/google";
import "mapbox-gl/dist/mapbox-gl.css";
import "./globals.css";

const roboto = Roboto({ subsets: ["latin", "vietnamese"], variable: "--font-roboto", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Bản đồ số Đà Nẵng", template: "%s | Bản đồ số Đà Nẵng" },
  description: "Tra cứu lớp dữ liệu hành chính và địa điểm công cộng thành phố Đà Nẵng.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body className={`${roboto.variable} font-sans antialiased`}>{children}</body></html>;
}
