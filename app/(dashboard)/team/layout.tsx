// app/team/layout.tsx
import TeamLayoutClient from "./TeamLayoutClient";

export default function TeamLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TeamLayoutClient>{children}</TeamLayoutClient>;
}
