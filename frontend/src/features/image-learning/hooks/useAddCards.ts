"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addCards } from "../api/image-learning_api";

export function useAddCards(imageUrl: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (wordIds: string[]) =>
      addCards({ wordIds, imageUrl: imageUrl || undefined, force: false }),
    onSuccess: () => {
      // Làm mới các danh sách thẻ nếu trang khác đang giữ cache
      void queryClient.invalidateQueries({ queryKey: ["cards"] });
      void queryClient.invalidateQueries({ queryKey: ["vocabulary"] });
    },
  });
}