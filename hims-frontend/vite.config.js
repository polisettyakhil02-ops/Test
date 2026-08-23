var _a;
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    server: {
        port: 5173,
        proxy: {
            // Dev-time convenience: lets the client call same-origin "/api/..."
            // paths while the actual hims-backend runs on its own port, and
            // keeps cookies (auth) same-site so the browser will send them.
            "/api": {
                target: (_a = process.env.VITE_API_PROXY_TARGET) !== null && _a !== void 0 ? _a : "http://localhost:4000",
                changeOrigin: true,
            },
        },
    },
});
