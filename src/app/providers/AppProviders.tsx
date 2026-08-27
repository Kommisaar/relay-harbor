// 全局 Provider：FluentProvider（主题）+ QueryClientProvider（服务端状态）。
// data-changed 的全局唯一监听点也在此（ADR-006），按项目前缀失效查询。
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { listenDataChanged } from "../../api/events";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 事件丢失兜底（ADR-006）：窗口聚焦时重新拉取
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

export function AppProviders({ children }: { children: ReactNode }) {
  useEffect(() => {
    const unlisten = listenDataChanged((projectId) => {
      // 事件只失效不传数据：所有 query key 以 ["projects", projectId, ...] 开头（关键约定）
      void queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </FluentProvider>
  );
}
