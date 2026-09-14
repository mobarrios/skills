import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Futbol Amateur",
  description: "Ratings y equipos equilibrados para futbol amateur",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
