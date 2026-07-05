import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Eye, Paperclip, FileText, Image as ImageIcon, File } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

/** Types the browser can render inline (image / PDF / plain text). */
function isPreviewable(mime: string): boolean {
  return (
    mime.startsWith("image/") ||
    mime === "application/pdf" ||
    mime.startsWith("text/")
  );
}

/**
 * Fetch the attachment bytes as a blob through the backend (same-origin, so no
 * CORS / popup issues) and return a local object URL. Callers must revoke it.
 */
async function fetchAttachmentBlobUrl(att: Attachment): Promise<string> {
  const res = await http.get(`/uploads/${att.id}`, { responseType: "blob" });
  return URL.createObjectURL(res.data as Blob);
}

async function downloadAttachment(att: Attachment) {
  // Backend streams the file bytes back through this same origin (it
  // server-side fetches the Stratus signed URL and pipes the body to us),
  // so axios + responseType:'blob' just works — no CORS, no redirect, no
  // popup blocker. We then trigger a save via a temporary anchor.
  const blobUrl = await fetchAttachmentBlobUrl(att);
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

  // Inline preview dialog state.
  const [previewAtt, setPreviewAtt] = useState<Attachment | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const openPreview = async (att: Attachment) => {
    // Revoke any previously-opened preview blob before loading the next.
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewError(null);
    setPreviewAtt(att);
    setPreviewLoading(true);
    try {
      setPreviewUrl(await fetchAttachmentBlobUrl(att));
    } catch {
      setPreviewError("Failed to load preview. You can still download the file.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewAtt(null);
    setPreviewError(null);
  };

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
                <div className="flex items-center gap-2">
                  {isPreviewable(att.mimeType) && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => openPreview(att)}
                    >
                      <Eye className="mr-1 h-3.5 w-3.5" />
                      Preview
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => downloadAttachment(att)}
                  >
                    <Download className="mr-1 h-3.5 w-3.5" />
                    Download
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Near-fullscreen inline preview — images as <img>, PDFs/text in an
          <iframe>. For PDFs we hide the built-in viewer toolbar + thumbnail
          panel (#toolbar=0&navpanes=0) so only the document shows. */}
      <Dialog open={Boolean(previewAtt)} onOpenChange={(open) => { if (!open) closePreview(); }}>
        <DialogContent className="flex h-[96vh] w-[98vw] max-w-[98vw] flex-col gap-0 p-0">
          <DialogHeader className="flex flex-row items-center justify-between gap-3 space-y-0 border-b px-4 py-2.5 pr-12">
            <DialogTitle className="truncate text-base">{previewAtt?.filename}</DialogTitle>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => previewAtt && downloadAttachment(previewAtt)}
            >
              <Download className="mr-1 h-3.5 w-3.5" />
              Download
            </Button>
          </DialogHeader>

          <div className="min-h-0 flex-1 bg-neutral-100">
            {previewLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Loading preview…
              </div>
            ) : previewError ? (
              <div className="flex h-full items-center justify-center text-sm text-red-600">
                {previewError}
              </div>
            ) : previewUrl && previewAtt ? (
              previewAtt.mimeType.startsWith("image/") ? (
                <img
                  src={previewUrl}
                  alt={previewAtt.filename}
                  className="h-full w-full object-contain"
                />
              ) : (
                <iframe
                  src={
                    previewAtt.mimeType === "application/pdf"
                      ? `${previewUrl}#toolbar=0&navpanes=0`
                      : previewUrl
                  }
                  title={previewAtt.filename}
                  className="h-full w-full border-0"
                />
              )
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
