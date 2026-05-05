import { useQuery } from "@tanstack/react-query";
import { Download, Paperclip, FileText, Image as ImageIcon, File } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadsApi, type Attachment, type AttachmentContextType } from "@/lib/api";
import { http } from "@/lib/api";

interface AttachmentsListProps {
  contextType: AttachmentContextType;
  contextId: string;
  title?: string;
  emptyMessage?: string;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function pickIcon(mime: string) {
  if (mime.startsWith("image/")) return ImageIcon;
  if (mime === "application/pdf" || mime.startsWith("text/")) return FileText;
  return File;
}

async function downloadAttachment(att: Attachment) {
  // Backend streams the file bytes back through this same origin (it
  // server-side fetches the Stratus signed URL and pipes the body to us),
  // so axios + responseType:'blob' just works — no CORS, no redirect, no
  // popup blocker. We then trigger a save via a temporary anchor.
  const res = await http.get(`/uploads/${att.id}`, { responseType: "blob" });
  const blobUrl = URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = att.filename || "attachment";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after a tick so Chrome has time to start the download.
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

export function AttachmentsList({
  contextType,
  contextId,
  title = "Attachments",
  emptyMessage = "No files uploaded.",
}: AttachmentsListProps) {
  const { data: attachments = [], isLoading, isError } = useQuery({
    queryKey: ["attachments", contextType, contextId],
    queryFn: () => uploadsApi.list(contextType, contextId),
    enabled: Boolean(contextId),
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Paperclip className="h-4 w-4" />
        <span>{title}</span>
        {attachments.length > 0 && (
          <span className="text-xs text-muted-foreground">({attachments.length})</span>
        )}
      </div>

      {isLoading && (
        <div className="text-xs text-muted-foreground">Loading attachments…</div>
      )}
      {isError && (
        <div className="text-xs text-red-600">Failed to load attachments.</div>
      )}
      {!isLoading && !isError && attachments.length === 0 && (
        <div className="text-xs text-muted-foreground">{emptyMessage}</div>
      )}

      {attachments.length > 0 && (
        <ul className="divide-y rounded-md border">
          {attachments.map((att) => {
            const Icon = pickIcon(att.mimeType);
            return (
              <li key={att.id} className="flex items-center gap-3 p-2 text-sm">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{att.filename}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatBytes(att.size)}
                    {att.createdAt && (
                      <> · {new Date(att.createdAt).toLocaleString()}</>
                    )}
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => downloadAttachment(att)}
                >
                  <Download className="mr-1 h-3.5 w-3.5" />
                  Download
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
