import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Forinda RTC SDK",
  description: "Open-source, framework-agnostic WebRTC SDK — publish, view, chat, record.",
  base: "/forinda-rtc-sdk/",
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ["meta", { name: "theme-color", content: "#3451b2" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:title", content: "Forinda RTC SDK" }],
  ],
  themeConfig: {
    nav: [
      { text: "Get Started", link: "/get-started/install" },
      { text: "Packages", link: "/packages/" },
      { text: "Cookbook", link: "/cookbook/architecture" },
      { text: "GitHub", link: "https://github.com/forinda/forinda-rtc-sdk" },
    ],
    sidebar: {
      "/get-started/": [
        {
          text: "Get Started",
          items: [
            { text: "Install", link: "/get-started/install" },
            { text: "Quick start", link: "/get-started/quick-start" },
            { text: "Pick your stack", link: "/get-started/pick-your-stack" },
          ],
        },
      ],
      "/packages/": [
        {
          text: "Packages",
          items: [
            { text: "Overview", link: "/packages/" },
            { text: "core", link: "/packages/core" },
            { text: "signaling-protocol", link: "/packages/signaling-protocol" },
            { text: "signaling-ws", link: "/packages/signaling-ws" },
            { text: "signaling-broadcast", link: "/packages/signaling-broadcast" },
            { text: "signaling-adapter-ws", link: "/packages/signaling-adapter-ws" },
            { text: "signaling-adapter-express", link: "/packages/signaling-adapter-express" },
            { text: "signaling-server", link: "/packages/signaling-server" },
            { text: "react", link: "/packages/react" },
            { text: "vue", link: "/packages/vue" },
            { text: "elements", link: "/packages/elements" },
            { text: "sfu-livekit", link: "/packages/sfu-livekit" },
          ],
        },
      ],
      "/cookbook/": [
        {
          text: "Cookbook",
          items: [
            { text: "Architecture", link: "/cookbook/architecture" },
            { text: "Patterns", link: "/cookbook/patterns" },
            { text: "SFU integration", link: "/cookbook/sfu-integration" },
            { text: "Troubleshooting", link: "/cookbook/troubleshooting" },
          ],
        },
      ],
    },
    socialLinks: [{ icon: "github", link: "https://github.com/forinda/forinda-rtc-sdk" }],
    search: { provider: "local" },
    editLink: {
      pattern: "https://github.com/forinda/forinda-rtc-sdk/edit/main/docs-site/:path",
      text: "Edit this page on GitHub",
    },
    footer: {
      message: "Released under the MIT License.",
      copyright: "© 2026 Felix Orinda",
    },
  },
});
