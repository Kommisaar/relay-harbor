// 设置读写（FR-016/017）：应用设置为非业务数据，是 UI 仅有的持久化写操作；
// 写后失效 ["settings"] 使 AppProviders 即时响应主题/语言（UI-003/004）。
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSettings, setSettings } from "../../api/commands";
import type { AppSettings } from "../../api/types";

export function useSettingsQuery() {
  return useQuery({ queryKey: ["settings"], queryFn: getSettings });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<AppSettings>) => setSettings(patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}
