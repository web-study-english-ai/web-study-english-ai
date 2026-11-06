"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { detectVocabulary } from "../api/image-learning_api";
import { DetectResult } from "../types/image-learning_types";
import { compressImage } from "../utils/compress_image";
import { validateImageFile } from "../utils/image_file";
import { isServiceUnavailable } from "../utils/vision_format";

export type Phase = "idle" | "compressing" | "detecting" | "done" | "error";
export type DetectErrorKind = "compress" | "unavailable" | "network";

export interface FileInfo {
  originalBytes: number;
  compressedBytes: number;
  wasCompressed: boolean;
}

export function useImageDetection() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [result, setResult] = useState<DetectResult | null>(null);
  const [resultId, setResultId] = useState(0);
  const [errorKind, setErrorKind] = useState<DetectErrorKind | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);

  const runRef = useRef(0); // mỗi lần chọn ảnh mới tăng 1, kết quả của lần cũ bị bỏ
  const urlRef = useRef<string | null>(null);
  const compressedRef = useRef<File | null>(null);

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const detect = useCallback(async (file: File, runId: number) => {
    setPhase("detecting");
    try {
      const data = await detectVocabulary(file);
      if (runRef.current !== runId) return;
      setResult(data);
      setResultId((n) => n + 1);
      setPhase("done");
    } catch (err) {
      if (runRef.current !== runId) return;
      setErrorKind(isServiceUnavailable(err) ? "unavailable" : "network");
      setErrorMessage(null);
      setPhase("error");
    }
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      const invalid = validateImageFile(file);
      if (invalid) {
        setInputError(invalid);
        return;
      }
      setInputError(null);

      const runId = ++runRef.current;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(file);
      urlRef.current = url;
      compressedRef.current = null;

      setPreviewUrl(url);
      setResult(null);
      setFileInfo(null);
      setErrorKind(null);
      setErrorMessage(null);
      setPhase("compressing");

      let compressed;
      try {
        compressed = await compressImage(file);
      } catch (err) {
        if (runRef.current !== runId) return;
        setErrorKind("compress");
        setErrorMessage(err instanceof Error ? err.message : "Không thể xử lý ảnh này.");
        setPhase("error");
        return;
      }
      if (runRef.current !== runId) return;

      compressedRef.current = compressed.file;
      setFileInfo({
        originalBytes: compressed.originalBytes,
        compressedBytes: compressed.compressedBytes,
        wasCompressed: compressed.wasCompressed,
      });
      await detect(compressed.file, runId);
    },
    [detect]
  );

  const retry = useCallback(() => {
    const file = compressedRef.current;
    if (!file) return;
    const runId = ++runRef.current;
    setErrorKind(null);
    setErrorMessage(null);
    void detect(file, runId);
  }, [detect]);

  return {
    phase,
    previewUrl,
    fileInfo,
    result,
    resultId,
    errorKind,
    errorMessage,
    inputError,
    handleFile,
    retry,
  };
}