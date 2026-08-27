// /chat (bez vybranej konverzácie) — samotný placeholder/empty-state pre
// desktop dvojpanelový layout renderuje priamo app/chat/layout.tsx (aby bol
// viditeľný aj keď je táto stránka na mobile skrytá v prospech zoznamu
// konverzácií v ľavom paneli). Tento súbor existuje iba preto, že Next.js
// App Router vyžaduje page.tsx pre samotnú "/chat" route.
export default function ChatIndexPage() {
  return null;
}
