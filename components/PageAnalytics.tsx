"use client";

import { Analytics } from "@vercel/analytics/next";

export default function PageAnalytics() {
  return <Analytics beforeSend={event => {
    if (event.type !== "pageview") return null;
    const url = new URL(event.url, window.location.origin);
    if (url.origin !== window.location.origin || url.pathname !== "/") return null;
    return { ...event, url: url.origin + "/" };
  }} />;
}
