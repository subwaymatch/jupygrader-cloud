"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, X, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PendingFile } from "@/types";

interface DropzoneUploaderProps {
  pendingFiles: PendingFile[];
  onFilesAdded: (files: File[]) => void;
  onFileRemoved: (index: number) => void;
  disabled?: boolean;
}

export function DropzoneUploader({
  pendingFiles,
  onFilesAdded,
  onFileRemoved,
  disabled = false,
}: DropzoneUploaderProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const ipynbFiles = acceptedFiles.filter((f) => f.name.endsWith(".ipynb"));
      if (ipynbFiles.length > 0) {
        onFilesAdded(ipynbFiles);
      }
    },
    [onFilesAdded]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/json": [".ipynb"] },
    multiple: true,
    disabled,
  });

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-all duration-200",
          isDragActive
            ? "border-blue-500 bg-blue-50 scale-[1.01]"
            : "border-gray-300 hover:border-gray-400 hover:bg-gray-50",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <input {...getInputProps()} />
        <Upload className="h-10 w-10 mx-auto mb-3 text-gray-400" />
        {isDragActive ? (
          <p className="text-blue-600 font-medium">Drop the .ipynb files here…</p>
        ) : (
          <>
            <p className="text-gray-600 font-medium">
              Drag & drop Jupyter notebooks here
            </p>
            <p className="text-sm text-gray-400 mt-1">
              or click to select files — only .ipynb allowed
            </p>
          </>
        )}
      </div>

      {pendingFiles.length > 0 && (
        <ul className="space-y-2">
          {pendingFiles.map((pf, idx) => (
            <li
              key={idx}
              className="flex items-center gap-3 px-4 py-2 rounded-md border bg-muted/30 text-sm"
            >
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="flex-1 truncate font-medium">{pf.file.name}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {(pf.file.size / 1024).toFixed(1)} KB
              </span>
              {pf.state === "uploading" && (
                <span className="text-xs text-blue-600 shrink-0 animate-pulse">
                  Uploading…
                </span>
              )}
              {pf.state === "done" && (
                <span className="text-xs text-green-600 shrink-0">✓ Uploaded</span>
              )}
              {pf.state === "error" && (
                <span className="text-xs text-red-500 shrink-0" title={pf.error}>
                  ✗ Failed
                </span>
              )}
              {pf.state === "idle" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => onFileRemoved(idx)}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
