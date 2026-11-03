import "server-only";
import { createClient } from "@/lib/supabase/server";

export const BUCKET = "company-files";

/** Short-lived download link, created as the signed-in user so storage policies apply (§5.13). */
export async function signedUrl(path: string | null, seconds = 300): Promise<string | null> {
  if (!path) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, seconds);
  if (error) return null;
  return data.signedUrl;
}
