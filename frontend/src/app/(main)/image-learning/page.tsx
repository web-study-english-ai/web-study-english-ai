"use client";

import { PageContainer } from "@/components/shared/PageContainer";
import { UploadPanel } from "@/features/image-learning/components/UploadPanel";
import { DetectionResults } from "@/features/image-learning/components/DetectionResults";
import { useImageDetection } from "@/features/image-learning/hooks/useImageDetection";

export default function ImageLearningPage() {
  const d = useImageDetection();

  return (
    <PageContainer>
      <h1 className="font-heading text-2xl font-semibold text-foreground">
        Nhận diện từ vựng qua hình ảnh AI
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Chụp hoặc tải lên ảnh một vật thể quanh bạn, AI sẽ gợi ý các từ vựng tiếng Anh tương ứng.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <section aria-labelledby="upload-title">
          <h2 id="upload-title" className="mb-3 font-heading text-base font-semibold text-foreground">
            Hình ảnh tải lên
          </h2>
          <UploadPanel
            phase={d.phase}
            previewUrl={d.previewUrl}
            fileInfo={d.fileInfo}
            inputError={d.inputError}
            onFile={d.handleFile}
          />
        </section>

        <section aria-labelledby="result-title">
          <h2 id="result-title" className="mb-3 font-heading text-base font-semibold text-foreground">
            Từ vựng đã nhận diện
          </h2>
          <DetectionResults
            phase={d.phase}
            result={d.result}
            resultId={d.resultId}
            errorKind={d.errorKind}
            errorMessage={d.errorMessage}
            onRetry={d.retry}
          />
        </section>
      </div>
    </PageContainer>
  );
}