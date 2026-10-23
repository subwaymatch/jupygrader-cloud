import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
  // Pre-bundle client dependencies at startup. Otherwise Vite discovers them
  // page by page in dev and reloads with a second copy of React.
  optimizeDeps: {
    include: [
      "@base-ui/react/alert-dialog",
      "@base-ui/react/checkbox",
      "@base-ui/react/dialog",
      "@base-ui/react/menu",
      "@base-ui/react/popover",
      "@base-ui/react/radio",
      "@base-ui/react/radio-group",
      "@base-ui/react/select",
      "@base-ui/react/tabs",
      "@base-ui/react/toast",
      "better-auth/react",
      "better-auth/client/plugins",
      "fflate",
      "marked",
    ],
  },
});
