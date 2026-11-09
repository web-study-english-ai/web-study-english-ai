"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addCards } from "../api/image-learning_api";
import { AddCardsResult } from "../types/image-learning_types";

interface AddVars {
  wordIds: string[];
  force: boolean;
}

export function useAddCards(imageUrl: string) {
  const queryClient = useQueryClient();

  return useMutation<AddCardsResult, Error, AddVars>({
    mutationFn: ({ wordIds, force }) =>
      addCards({ wordIds, imageUrl: imageUrl || undefined, force }),
    onSuccess: () => {
      // ["cards"] làm mới cả tab "Bộ thẻ của tôi" lẫn "Học từ mới"
      void queryClient.invalidateQueries({ queryKey: ["cards"] });
    },
  });
}