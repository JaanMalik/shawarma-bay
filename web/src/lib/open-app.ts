/** Hands the customer back to the mobile app through its custom URL scheme (shawarmabay://…). */
export function openApp(url: string) {
  window.location.href = url;
}
