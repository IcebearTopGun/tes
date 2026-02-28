import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { fetchWithAuth } from "./fetcher";

type UnauthorizedBehavior = "returnNull" | "throw";

export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401 }) =>
  async ({ queryKey }) => {
    try {
      const res = await fetchWithAuth(queryKey.join("/") as string);
      return await res.json();
    } catch (error: any) {
      if (error.message.includes("401") && on401 === "returnNull") {
        return null;
      }
      throw error;
    }
  };

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown,
): Promise<Response> {
  const res = await fetchWithAuth(url, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: data ? JSON.stringify(data) : undefined,
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || "An error occurred");
  }

  return res;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
    mutations: {
      retry: false,
    },
  },
});
