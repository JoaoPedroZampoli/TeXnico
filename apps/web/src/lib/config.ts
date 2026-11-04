export const APP_NAME = "TeXnico";

/** Base URL of the realtime/compile server (http[s]://…). */
export const REALTIME_URL = (process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:4000").replace(/\/$/, "");
export const REALTIME_WS_URL = REALTIME_URL.replace(/^http/, "ws");
