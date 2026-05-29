import { supabase } from "./supabase";

/** Nahrá obrázok do zdieľaného bucketu `chat-attachments` a vráti verejnú URL. */
export async function uploadLibraryImage(userId: string, file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Súbor musí byť obrázok");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Obrázok je príliš veľký (max 5 MB)");
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${userId}/library/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("chat-attachments").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("chat-attachments").getPublicUrl(path);
  return data.publicUrl;
}