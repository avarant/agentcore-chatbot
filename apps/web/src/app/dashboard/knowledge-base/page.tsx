"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useCustomer } from "../customer-context";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Upload,
  Trash2,
  RefreshCw,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

type Document = {
  key: string;
  size: number;
  lastModified: string;
};

type SyncStatus = "idle" | "syncing" | "synced" | "error";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const { siteId } = useCustomer();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (siteId) params.set("site", siteId);
      const res = await fetch(`${API_URL}/api/documents?${params}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [siteId, fetchDocuments]);

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      // Get presigned URL
      const params = new URLSearchParams();
      if (siteId) params.set("site", siteId);
      const res = await fetch(`${API_URL}/api/documents/upload?${params}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
        }),
      });

      if (!res.ok) throw new Error("Failed to get upload URL");
      const { uploadUrl } = await res.json();

      // Upload directly to S3
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });

      if (!uploadRes.ok) throw new Error("Upload failed");

      // Refresh document list and trigger sync
      await fetchDocuments();
      await triggerSync();
    } catch (err) {
      console.error("Upload error:", err);
    } finally {
      setUploading(false);
    }
  }

  async function triggerSync() {
    setSyncStatus("syncing");
    try {
      const params = new URLSearchParams();
      if (siteId) params.set("site", siteId);
      const res = await fetch(`${API_URL}/api/documents/sync?${params}`, {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok) {
        setSyncStatus("error");
        return;
      }

      const data = await res.json();
      if (data.ingestionJobId) {
        pollSyncStatus(data.ingestionJobId);
      }
    } catch {
      setSyncStatus("error");
    }
  }

  async function pollSyncStatus(jobId: string) {
    const maxAttempts = 60;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 3000));

      try {
        const params = new URLSearchParams();
        if (siteId) params.set("site", siteId);
        const res = await fetch(
          `${API_URL}/api/documents/sync-status/${jobId}?${params}`,
          { credentials: "include" }
        );
        if (!res.ok) continue;

        const data = await res.json();
        if (data.status === "COMPLETE") {
          setSyncStatus("synced");
          return;
        }
        if (data.status === "FAILED") {
          setSyncStatus("error");
          return;
        }
      } catch {
        // continue polling
      }
    }
    setSyncStatus("error");
  }

  async function deleteDocument(key: string) {
    try {
      const params = new URLSearchParams();
      if (siteId) params.set("site", siteId);
      const res = await fetch(
        `${API_URL}/api/documents/${encodeURIComponent(key)}?${params}`,
        { method: "DELETE", credentials: "include" }
      );
      if (res.ok) {
        setDocuments((prev) => prev.filter((d) => d.key !== key));
      }
    } catch {
      // ignore
    }
  }

  async function viewDocument(key: string) {
    try {
      const params = new URLSearchParams();
      if (siteId) params.set("site", siteId);
      const res = await fetch(
        `${API_URL}/api/documents/view/${encodeURIComponent(key)}?${params}`,
        { credentials: "include" }
      );
      if (res.ok) {
        const data = await res.json();
        window.open(data.url, "_blank");
      }
    } catch {
      // ignore
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) uploadFile(files[0]);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files && files.length > 0) uploadFile(files[0]);
    e.target.value = "";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Knowledge Base</h1>
        <div className="flex items-center gap-2">
          {syncStatus === "syncing" && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Syncing...
            </span>
          )}
          {syncStatus === "synced" && (
            <span className="flex items-center gap-1.5 text-xs text-green-600">
              <CheckCircle2 className="size-3.5" />
              Synced
            </span>
          )}
          {syncStatus === "error" && (
            <span className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="size-3.5" />
              Sync failed
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => { fetchDocuments(); triggerSync(); }}
            disabled={loading || syncStatus === "syncing"}
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Sync
          </Button>
        </div>
      </div>

      {/* Upload area */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload Documents</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
              dragOver
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/50"
            }`}
          >
            {uploading ? (
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            ) : (
              <Upload className="size-8 text-muted-foreground" />
            )}
            <p className="mt-2 text-sm text-muted-foreground">
              {uploading
                ? "Uploading..."
                : "Drag & drop a file here, or click to browse"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              PDF, TXT, MD, CSV, DOC, DOCX
            </p>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.txt,.md,.csv,.doc,.docx,.html,.json,.xml"
              onChange={handleFileSelect}
            />
          </div>
        </CardContent>
      </Card>

      {/* Document list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Uploaded Documents</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading documents...</p>
          ) : documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No documents uploaded yet. Upload files to make them available to your agent.
            </p>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div
                  key={doc.key}
                  className="flex items-center justify-between rounded-md border px-4 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{doc.key}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(doc.size)}
                        {doc.lastModified && (
                          <> &middot; {new Date(doc.lastModified).toLocaleDateString()}</>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => viewDocument(doc.key)}
                    >
                      <ExternalLink className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteDocument(doc.key)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
