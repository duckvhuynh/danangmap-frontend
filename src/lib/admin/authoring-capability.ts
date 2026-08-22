export const desktopAuthoringQuery = "(min-width: 1024px) and (hover: hover) and (pointer: fine)";
export const wideReviewLayoutQuery = "(min-width: 768px)";

interface NavigatorCapabilitySnapshot {
  maxTouchPoints?: number;
  platform?: string;
  userAgent?: string;
  userAgentData?: { mobile?: boolean };
}

export function isKeyboardAuthoringDevice(navigatorValue: NavigatorCapabilitySnapshot) {
  if (navigatorValue.userAgentData?.mobile === true) return false;
  const userAgent = navigatorValue.userAgent ?? "";
  if (/Android|iPhone|iPad|iPod|Mobile|Tablet/iu.test(userAgent)) return false;
  if (navigatorValue.platform === "MacIntel" && (navigatorValue.maxTouchPoints ?? 0) > 1) return false;
  return true;
}

export function getDesktopAuthoringCapability() {
  return window.matchMedia(desktopAuthoringQuery).matches && isKeyboardAuthoringDevice(navigator);
}

export function getServerDesktopAuthoringCapability() {
  return false;
}

export function getWideReviewLayout() {
  return window.matchMedia(wideReviewLayoutQuery).matches;
}

export function getServerWideReviewLayout() {
  return false;
}

export function subscribeDesktopAuthoringCapability(callback: () => void) {
  const media = window.matchMedia(desktopAuthoringQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

export function subscribeWideReviewLayout(callback: () => void) {
  const media = window.matchMedia(wideReviewLayoutQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
