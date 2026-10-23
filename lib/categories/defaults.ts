export type DefaultCategory = { name: string; icon: string; color: string; subs?: string[] };

export const DEFAULT_EXPENSE: DefaultCategory[] = [
  { name: "Vivienda", icon: "home", color: "#0f8a7e", subs: ["Arriendo", "Dividendo", "Gastos comunes", "Mantención"] },
  { name: "Servicios básicos", icon: "bolt", color: "#0ea5e9", subs: ["Luz", "Agua", "Gas", "Internet y telefonía"] },
  { name: "Alimentación", icon: "utensils", color: "#f97362", subs: ["Supermercado", "Feria y almacén"] },
  { name: "Transporte", icon: "car", color: "#f5b82e", subs: ["Combustible", "Transporte público", "Estacionamiento y peajes", "Apps de transporte"] },
  { name: "Salud y bienestar", icon: "heart", color: "#9b7be0", subs: ["Farmacia", "Consultas", "Isapre / Fonasa", "Deporte"] },
  { name: "Educación", icon: "book", color: "#3b82f6", subs: ["Colegiatura", "Cursos", "Materiales"] },
  { name: "Ocio y restaurantes", icon: "glass", color: "#ec4899", subs: ["Restaurantes", "Delivery", "Entretenimiento", "Suscripciones"] },
  { name: "Compras personales", icon: "bag", color: "#f59e0b", subs: ["Ropa", "Tecnología", "Hogar"] },
  { name: "Mascotas", icon: "paw", color: "#84cc16", subs: ["Alimento", "Veterinario"] },
  { name: "Viajes", icon: "plane", color: "#06b6d4", subs: ["Pasajes", "Alojamiento"] },
  { name: "Seguros e impuestos", icon: "shield", color: "#64748b", subs: ["Seguros", "Contribuciones", "Impuestos"] },
  { name: "Comisiones e intereses", icon: "percent", color: "#ef4444", subs: ["Comisiones bancarias", "Intereses"] },
  { name: "Otros gastos", icon: "dots", color: "#7cb7f5" },
];

export const DEFAULT_INCOME: DefaultCategory[] = [
  { name: "Sueldo", icon: "wallet", color: "#16a34a" },
  { name: "Honorarios", icon: "briefcase", color: "#0f8a7e" },
  { name: "Ventas", icon: "tag", color: "#22c55e" },
  { name: "Arriendos", icon: "key", color: "#14b8a6" },
  { name: "Intereses y dividendos", icon: "trend", color: "#10b981" },
  { name: "Otros ingresos", icon: "dots", color: "#65a30d" },
];

export const CATEGORY_ICONS = ["home", "bolt", "utensils", "car", "heart", "book", "glass", "bag", "paw", "plane", "shield", "percent", "dots", "wallet", "briefcase", "tag", "key", "trend", "cart", "gift", "phone", "baby", "tool", "music"];
