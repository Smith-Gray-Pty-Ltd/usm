/**
 * ASCII art banner for the USM CLI.
 *
 * Shown on `usm` with no args and `usm --help`. Inline ASCII (no figlet
 * dependency). Suppressed in non-TTY environments.
 */
import { pc } from "./colors.js";

const isTTY = process.stdout.isTTY && !process.env.NO_COLOR;

export const ASCII_BANNER = String.raw`
 _   _ ___ _
| | | / __| |  Universal System Map
| |_|\__ \ |  ${pc.dim("structured source of truth for agentic systems")}
 \___|___/_|
`;

/** Print the ASCII banner. No-op in non-TTY. */
export function printBanner(): void {
  if (!isTTY) return;
  console.log(ASCII_BANNER);
}