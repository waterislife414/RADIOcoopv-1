// Entry point for the demo build only (vite --mode demo). It starts the
// in-browser backend, then loads the normal app untouched.
import React from "react";
import ReactDOM from "react-dom/client";
import { bootDemo } from "./boot";
import DemoBar from "./DemoBar";

await bootDemo();
await import("../main.jsx");

const host = document.createElement("div");
document.body.appendChild(host);
ReactDOM.createRoot(host).render(<DemoBar />);
