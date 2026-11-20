"use client";

import { ErrorView } from "@/components/ui/error-view";

export default function AdminError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorView {...props} help={false} />;
}
