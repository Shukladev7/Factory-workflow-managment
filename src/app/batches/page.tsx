'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function BatchesRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/batches/overview');
  }, [router]);

  return null;
}
