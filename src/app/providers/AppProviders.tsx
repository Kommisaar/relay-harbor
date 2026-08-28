// 全局 Provider：QueryClientProvider → 设置门控 → FluentProvider（主题 UI-003）+ 语言解析（UI-004）。
// data-changed 的全局唯一监听点也在此（ADR-006），按项目前缀失效查询；
// mock 模式下事件监听为空实现（api/events.ts，2026-08-28）。
import {
  FluentProvider,
  Spinner,
  webDarkTheme,
  webLightTheme,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { getSettings } from "../../api/commands";
import { listenDataChanged } from "../../api/events";
import { useResolvedTheme } from "../../components/useResolvedTheme";
import { i18n, resolveSystemLanguage } from "../../i18n";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 事件丢失兜底（ADR-006）：窗口聚焦时重新拉取
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

const useSplash = makeStyles({
  root: {
    width: "100%",
    height: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
});

/** 主题与语言按设置解析（跟随系统档位监听系统变化，UI-003/004） */
function ThemedRoot({ children }: { children: ReactNode }) {
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const resolved = useResolvedTheme();
  const theme = resolved === "dark" ? webDarkTheme : webLightTheme;

  const language = settings ? (settings.language === "system" ? resolveSystemLanguage() : settings.language) : "zh";
  useEffect(() => {
    void i18n.changeLanguage(language);
  }, [language]);

  return <FluentProvider theme={theme}>{children}</FluentProvider>;
}

/** 设置就绪门控：last_location 恢复依赖设置先加载（UI-005），加载期显示启动占位 */
function SettingsGate({ children }: { children: ReactNode }) {
  const styles = useSplash();
  const { isPending } = useQuery({ queryKey: ["settings"], queryFn: getSettings });

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
    <ThemedRoot>
      {isPending ? (
        <div className={styles.root}>
          <Spinner size="medium" />
        </div>
      ) : (
        children
      )}
    </ThemedRoot>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SettingsGate>{children}</SettingsGate>
    </QueryClientProvider>
  );
}
