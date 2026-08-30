// -----------------------------------------------------------------------------
// MOBILE root layout — čistý re-export koreňového app/layout.tsx. Next.js
// vyžaduje, aby KAŽDÝ projekt mal vlastný app/layout.tsx (routovací koreň),
// preto tento súbor musí fyzicky existovať tu v mobile/ — ale jeho OBSAH
// (LocaleProvider, LegalAcceptanceGate, CompanyDpaGate, FloatingChatWidget,
// fonty, metadata) je 100% zdieľaný, nič sa neduplikuje ani neprepisuje.
// -----------------------------------------------------------------------------
export { default, metadata, viewport } from "@/app/layout";
