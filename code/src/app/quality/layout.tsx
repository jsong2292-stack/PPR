import { QualityShell } from '@/components/quality/QualityShell';

export default function QualityLayout({ children }: { children: React.ReactNode }) {
  return <QualityShell>{children}</QualityShell>;
}
