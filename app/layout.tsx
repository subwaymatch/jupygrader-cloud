import type { Metadata, Viewport } from "next";
import { ConfirmProvider } from "@/components/ui/Dialog";
import { ToastProvider } from "@/components/ui/Toast";
import "./styles/base.css";
import "./styles/ui.css";
import "./styles/shell.css";
import "./styles/screens.css";
import "./styles/notebook.css";

export const metadata: Metadata = {
  title: { default: "Jupygrader", template: "%s · Jupygrader" },
  description: "AI-assisted grading for Jupyter notebooks and other student work.",
  icons: { icon: "/logo.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>
        <ToastProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
