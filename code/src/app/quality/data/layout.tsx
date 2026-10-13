import { AdminGuard } from '@/components/auth/AdminGuard';

export default function QualityDataLayout({ children }: { children: React.ReactNode }) {
  return <AdminGuard>{children}</AdminGuard>;
}
