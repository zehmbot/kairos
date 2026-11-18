import { useQuery } from "@tanstack/react-query";
import { HealthSchema } from "../shared/types.ts";

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const response = await fetch("/api/health");
      if (!response.ok) throw new Error(`Hub answered ${response.status}`);
      return HealthSchema.parse(await response.json());
    },
    refetchInterval: 5000,
    retry: false,
  });
}
