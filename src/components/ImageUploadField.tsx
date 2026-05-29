import { useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uploadLibraryImage } from "@/lib/libraryImageUpload";
import { useCurrentUserId } from "@/lib/queries";

export function ImageUploadField({
  value,
  onChange,
  label = "Obrázok náhľadu (voliteľné)",
}: {
  value: string;
  onChange: (url: string) => void;
  label?: string;
}) {
  const userId = useCurrentUserId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return;
    if (!userId) {
      toast.error("Najprv sa prihlás");
      return;
    }
    setUploading(true);
    try {
      const url = await uploadLibraryImage(userId, file);
      onChange(url);
      toast.success("Obrázok nahraný");
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa nahrať obrázok");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-muted-foreground">{label}</label>
      {value && (
        <div className="mb-2 flex items-center gap-2 rounded-xl border border-border bg-surface-muted p-2">
          <div className="h-16 w-24 overflow-hidden rounded-lg bg-card">
            <img src={value} alt="náhľad" className="h-full w-full object-cover" />
          </div>
          <button
            type="button"
            onClick={() => onChange("")}
            className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-card hover:text-destructive"
            aria-label="Odstrániť obrázok"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://…/obrazok.png"
          className="sm:flex-1"
        />
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          <Upload className="mr-1 h-4 w-4" />
          {uploading ? "Nahrávam…" : "Nahrať"}
        </Button>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Vlož URL alebo nahraj obrázok (max 5 MB). Automaticky sa prispôsobí do bloku.
      </p>
    </div>
  );
}