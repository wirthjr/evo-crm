// src/hooks/useIsDarkClass.ts
import { useEffect, useState } from "react";

export function useIsDarkClass() {
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains("dark") ||
    document.documentElement.classList.contains("dar-red")
  );

  useEffect(() => {
    const obs = new MutationObserver(() => {
      const root = document.documentElement;
      setIsDark(root.classList.contains("dark") || root.classList.contains("dar-red"));
    });

    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  return isDark;
}
