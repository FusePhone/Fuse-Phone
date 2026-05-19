import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { FusePhoneLogoImage } from "@/components/FusePhoneLogo";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  DollarSign, ShieldCheck, Car, Wrench, Megaphone, Briefcase, Monitor, MoreHorizontal,
  Calculator, TrendingUp, Users, ArrowUpRight, ArrowDownRight, Target, Clock, Plus, Trash2,
  Download, Check, ArrowRight, Zap, Globe,
} from "lucide-react";

const T = {
  en: {
    heroTitle: "Net Profit & Hourly Rate Calculator",
    heroSubtitle: "Find out exactly what you need to charge per hour to cover all your costs and reach your profit goals. No sign-up needed — just enter your numbers below.",
    howItWorks: "How It Works",
    step1Title: "1. Add Your Crew",
    step1Desc: "Enter each employee's hourly wage and burden rates (taxes, workers comp, benefits). We'll calculate the true cost of each team member per hour.",
    step2Title: "2. Enter Your Overhead",
    step2Desc: "List all your fixed business expenses — insurance, vehicle costs, marketing, software, etc. We convert everything to a monthly total automatically.",
    step3Title: "3. Set Your Profit Goal",
    step3Desc: "Use the slider to choose your target net profit percentage. The calculator will tell you exactly what to charge per hour to hit that goal.",
    summaryTitle: "Your Numbers",
    monthly: "Monthly",
    yearly: "Yearly",
    netProfit: "Net Profit",
    netProfitTip: "Your target net profit percentage after ALL costs (labor + overhead). Industry benchmarks: below 10% needs attention, 10-19% okay, 20%+ is healthy.",
    overhead: "Overhead",
    overheadTip: "Your total fixed business costs (insurance, vehicle, marketing, office, etc.) that you pay regardless of how many jobs you do.",
    labor: "Labor",
    laborTip: "Your total crew labor cost including wages, employer taxes, workers comp insurance, and any benefits you provide. This is what it actually costs you to have your crew working.",
    crew: "crew",
    sellRate: "Sell Rate",
    sellRateTip: "What you should charge per hour. Calculated as: (Labor Cost + Overhead/hr) ÷ (1 - Net Profit %). This covers your labor, overhead, AND builds in your net profit.",
    breakEven: "Break-even",
    breakEvenTip: "The minimum revenue you need to cover all costs (overhead + labor) before making any profit. Below this number, you're losing money.",
    profit: "Profit",
    profitTip: "Your projected net profit after all costs. This is revenue minus overhead minus labor. A positive number means you're making money.",
    breakEvenAt: "Break-even at",
    breakEvenHrsTip: "How many billable hours your crew needs to work just to cover all your costs. After this many hours, every additional hour is pure profit.",
    sellAll: "Sell all",
    hrs: "hrs",
    sellAllTip: "If your crew works and bills every available hour at your sell rate, this is your maximum potential revenue.",
    laborCost: "Labor Cost",
    grossMargin: "Gross Margin",
    netProfitSliderTip: "Your target net profit percentage after ALL costs (labor + overhead). The sell rate is calculated to achieve this. Industry benchmark: 20-35% is healthy.",
    target: "target",
    prodEmployees: "Production Employees",
    prodEmployeesTip: "These are your team members who do the actual billable work on job sites. Their true cost includes wages plus payroll taxes, workers comp insurance, and any benefits you provide.",
    prodEmployeesDesc: "Your team members who do the actual work on job sites. For each person, enter their hourly wage and the additional costs you pay on top (payroll taxes, workers comp, benefits).",
    addEmployee: "Add",
    trueCost: "True cost",
    hourlyRate: "Hourly Rate ($)",
    hourlyRateTip: "The base hourly wage you pay this employee before any additional costs like taxes or insurance.",
    payrollBurden: "Payroll Burden %",
    payrollBurdenTip: "Employer-paid payroll taxes (Social Security, Medicare, unemployment). Typically 10-15% of wages.",
    workersComp: "Workers Comp %",
    workersCompTip: "The insurance you pay to cover on-the-job injuries. It's a percentage of wages and varies by trade — painting is typically 8-20%, roofing 15-30%.",
    benefits: "Benefits $/hr",
    benefitsTip: "Any extra per-hour cost you pay for things like health insurance, retirement contributions, or paid time off.",
    avgHourlyWage: "Avg Hourly Wage",
    avgTrueLaborCost: "Avg True Labor Cost",
    crewSize: "Crew Size",
    noEmployees: "Add at least one production employee to calculate labor costs",
    nonProdEmployees: "Non-Production Employees",
    nonProdEmployeesTip: "Staff who support your business but don't do billable work on job sites (office manager, sales, virtual assistant). Their cost is added to your overhead, not your labor cost.",
    nonProdEmployeesDesc: "Staff who support your business but don't do billable work — like an office manager, sales rep, or virtual assistant. Their salary is added to your overhead costs.",
    noNonProd: "No non-production employees added.",
    monthlyCost: "Monthly Cost ($)",
    totalNonProdCost: "Total non-production cost",
    overheadExpenses: "Overhead Expenses",
    overheadExpensesTip: "Fixed costs you pay to run your business regardless of how many jobs you complete. These are NOT tied to specific jobs. Include all recurring expenses to get an accurate overhead rate.",
    overheadExpensesDesc: "These are costs you pay whether you have jobs or not. Enter the amount and how often you pay each one — we'll calculate the monthly total for you.",
    noExpenses: "No expenses in this category",
    weekly: "Weekly",
    monthlyFreq: "Monthly",
    quarterly: "Quarterly",
    yearlyFreq: "Yearly",
    downloadTitle: "Download Your Results",
    downloadDesc: "Save your overhead calculations to reference when pricing your next job.",
    downloadBtn: "Download Results",
    plansTitle: "Ready to Run Your Business Smarter?",
    plansDesc: "FusePhone gives you everything you need to manage leads, send proposals, track projects, and get paid - all in one place.",
    getStarted: "Get Started",
    mostPopular: "Most Popular",
    freeTrial3: "14-day free trial — card required",
    freeTrial15: "14-day free trial — card required",
    footerText: "The all-in-one CRM for home service contractors.",
    insurance: "Insurance",
    vehicleFuel: "Vehicle & Fuel",
    operations: "Operations",
    marketing: "Marketing",
    professionalServices: "Professional Services",
    softwareSubscriptions: "Software & Subscriptions",
    other: "Other",
    va: "Virtual Assistant",
    secretary: "Secretary / Office",
    sales: "Sales",
    estimator: "Estimator",
    otherRole: "Other",
    download: "Download",
  },
  es: {
    heroTitle: "Calculadora de Ganancia Neta y Tarifa por Hora",
    heroSubtitle: "Descubre exactamente cuánto necesitas cobrar por hora para cubrir todos tus costos y alcanzar tus metas de ganancia. No necesitas registrarte — solo ingresa tus números abajo.",
    howItWorks: "Cómo Funciona",
    step1Title: "1. Agrega Tu Equipo",
    step1Desc: "Ingresa el salario por hora de cada empleado y sus costos adicionales (impuestos, seguro de compensación, beneficios). Calcularemos el costo real de cada miembro del equipo por hora.",
    step2Title: "2. Ingresa Tus Gastos Fijos",
    step2Desc: "Lista todos tus gastos fijos del negocio — seguro, vehículo, mercadeo, software, etc. Convertimos todo a un total mensual automáticamente.",
    step3Title: "3. Establece Tu Meta de Ganancia",
    step3Desc: "Usa el deslizador para elegir tu porcentaje de ganancia neta deseado. La calculadora te dirá exactamente cuánto cobrar por hora para alcanzar esa meta.",
    summaryTitle: "Tus Números",
    monthly: "Mensual",
    yearly: "Anual",
    netProfit: "Ganancia Neta",
    netProfitTip: "Tu porcentaje de ganancia neta objetivo después de TODOS los costos (mano de obra + gastos fijos). Referencia: menos de 10% necesita atención, 10-19% aceptable, 20%+ saludable.",
    overhead: "Gastos Fijos",
    overheadTip: "Tus costos fijos totales del negocio (seguro, vehículo, mercadeo, oficina, etc.) que pagas sin importar cuántos trabajos hagas.",
    labor: "Mano de Obra",
    laborTip: "El costo total de mano de obra de tu equipo incluyendo salarios, impuestos del empleador, seguro de compensación y beneficios.",
    crew: "equipo",
    sellRate: "Tarifa de Venta",
    sellRateTip: "Lo que debes cobrar por hora. Se calcula como: (Costo Laboral + Gastos Fijos/hr) ÷ (1 - % Ganancia Neta). Esto cubre tu mano de obra, gastos fijos Y tu ganancia.",
    breakEven: "Punto de Equilibrio",
    breakEvenTip: "El ingreso mínimo que necesitas para cubrir todos los costos antes de tener ganancia. Por debajo de este número, estás perdiendo dinero.",
    profit: "Ganancia",
    profitTip: "Tu ganancia neta proyectada después de todos los costos. Es ingreso menos gastos fijos menos mano de obra.",
    breakEvenAt: "Equilibrio en",
    breakEvenHrsTip: "Cuántas horas facturables necesita tu equipo para cubrir todos los costos. Después de estas horas, cada hora adicional es ganancia pura.",
    sellAll: "Vender todas",
    hrs: "hrs",
    sellAllTip: "Si tu equipo trabaja y factura todas las horas disponibles a tu tarifa, este es tu ingreso máximo potencial.",
    laborCost: "Costo Laboral",
    grossMargin: "Margen Bruto",
    netProfitSliderTip: "Tu porcentaje de ganancia neta objetivo después de TODOS los costos. La tarifa de venta se calcula para lograr esto. Referencia: 20-35% es saludable.",
    target: "meta",
    prodEmployees: "Empleados de Producción",
    prodEmployeesTip: "Son los miembros de tu equipo que hacen el trabajo facturable en los sitios de trabajo. Su costo real incluye salarios más impuestos, seguro de compensación y beneficios.",
    prodEmployeesDesc: "Los miembros de tu equipo que hacen el trabajo en los sitios. Para cada persona, ingresa su salario por hora y los costos adicionales que pagas (impuestos, seguro, beneficios).",
    addEmployee: "Agregar",
    trueCost: "Costo real",
    hourlyRate: "Tarifa por Hora ($)",
    hourlyRateTip: "El salario base por hora que le pagas a este empleado antes de costos adicionales como impuestos o seguro.",
    payrollBurden: "Carga de Nómina %",
    payrollBurdenTip: "Impuestos de nómina pagados por el empleador (Seguro Social, Medicare, desempleo). Típicamente 10-15% del salario.",
    workersComp: "Compensación Laboral %",
    workersCompTip: "El seguro que pagas para cubrir lesiones en el trabajo. Es un porcentaje del salario y varía por oficio — pintura típicamente 8-20%, techos 15-30%.",
    benefits: "Beneficios $/hr",
    benefitsTip: "Cualquier costo extra por hora que pagas por cosas como seguro médico, contribuciones de retiro o tiempo libre pagado.",
    avgHourlyWage: "Salario Promedio/hr",
    avgTrueLaborCost: "Costo Real Promedio",
    crewSize: "Tamaño del Equipo",
    noEmployees: "Agrega al menos un empleado de producción para calcular costos laborales",
    nonProdEmployees: "Empleados No Productivos",
    nonProdEmployeesTip: "Personal que apoya tu negocio pero no hace trabajo facturable (gerente de oficina, ventas, asistente virtual). Su costo se agrega a tus gastos fijos.",
    nonProdEmployeesDesc: "Personal que apoya tu negocio pero no hace trabajo facturable — como un gerente de oficina, representante de ventas o asistente virtual. Su salario se agrega a tus gastos fijos.",
    noNonProd: "No se han agregado empleados no productivos.",
    monthlyCost: "Costo Mensual ($)",
    totalNonProdCost: "Costo total no productivo",
    overheadExpenses: "Gastos Fijos del Negocio",
    overheadExpensesTip: "Costos fijos que pagas para operar tu negocio sin importar cuántos trabajos completes. NO están ligados a trabajos específicos.",
    overheadExpensesDesc: "Estos son costos que pagas tengas trabajos o no. Ingresa el monto y con qué frecuencia pagas cada uno — calcularemos el total mensual por ti.",
    noExpenses: "Sin gastos en esta categoría",
    weekly: "Semanal",
    monthlyFreq: "Mensual",
    quarterly: "Trimestral",
    yearlyFreq: "Anual",
    downloadTitle: "Descarga Tus Resultados",
    downloadDesc: "Guarda tus cálculos de gastos para referencia cuando pongas precio a tu próximo trabajo.",
    downloadBtn: "Descargar Resultados",
    plansTitle: "¿Listo para Manejar tu Negocio Mejor?",
    plansDesc: "FusePhone te da todo lo que necesitas para manejar clientes potenciales, enviar propuestas, rastrear proyectos y cobrar — todo en un solo lugar.",
    getStarted: "Comenzar",
    mostPopular: "Más Popular",
    freeTrial3: "Prueba gratis de 14 días — se requiere tarjeta",
    freeTrial15: "Prueba gratis de 14 días — se requiere tarjeta",
    footerText: "El CRM todo-en-uno para contratistas de servicios del hogar.",
    insurance: "Seguros",
    vehicleFuel: "Vehículo y Combustible",
    operations: "Operaciones",
    marketing: "Mercadeo",
    professionalServices: "Servicios Profesionales",
    softwareSubscriptions: "Software y Suscripciones",
    other: "Otros",
    va: "Asistente Virtual",
    secretary: "Secretaria / Oficina",
    sales: "Ventas",
    estimator: "Estimador",
    otherRole: "Otro",
    download: "Descargar",
  },
};

type Lang = "en" | "es";

const STARTER_FEATURES_I18N: Record<Lang, string[]> = {
  en: [
    "Dashboard Overview",
    "Contact Management",
    "Basic Project Pipeline (6 Stages)",
    "Estimates, Proposals & Invoices",
    "Digital Signatures & Customer Portal",
    "3 Email Follow-Up Automations",
    "Document Templates",
    "Net Profit & Hourly Rate Calculator",
    "Company Profile & Settings",
  ],
  es: [
    "Panel General",
    "Gestión de Contactos",
    "Pipeline Básico (6 Etapas)",
    "Estimados, Propuestas y Facturas",
    "Firmas Digitales y Portal del Cliente",
    "3 Automatizaciones de Email",
    "Plantillas de Documentos",
    "Calculadora de Ganancia y Tarifa",
    "Perfil y Configuración de Empresa",
  ],
};

const CORE_FEATURES_I18N: Record<Lang, string[]> = {
  en: [
    "Everything in Starter",
    "Full 8-Stage Project Pipeline",
    "Next Steps & Project Actions",
    "Business Metrics & Analytics",
    "Calendar & Scheduling",
    "Public Booking Page",
    "SMS Texting (Twilio)",
    "Basic Call Logging",
    "Push Notifications",
    "Full Email Automations",
    "Payment Requests (Manual)",
    "Financial Settings & Job Costing",
  ],
  es: [
    "Todo en Starter",
    "Pipeline Completo de 8 Etapas",
    "Próximos Pasos y Acciones",
    "Métricas y Analíticas",
    "Calendario y Programación",
    "Página de Reservas Pública",
    "Mensajes SMS (Twilio)",
    "Registro Básico de Llamadas",
    "Notificaciones Push",
    "Automatizaciones de Email Completas",
    "Solicitudes de Pago (Manual)",
    "Configuración Financiera y Costeo",
  ],
};

const ELITE_FEATURES_I18N: Record<Lang, string[]> = {
  en: [
    "Everything in Core",
    "Full Phone System (VoIP, IVR)",
    "Call Transfer & Conferencing",
    "Jobs & Crew Management",
    "Time Tracking & Payroll",
    "Stripe Payment Collection",
    "SMS & Email Automations",
    "Production Rate Estimator",
    "FuseAI Included (AI proposals, sentiment, receipt extraction & more)",
  ],
  es: [
    "Todo en Core",
    "Sistema Telefónico Completo (VoIP, IVR)",
    "Transferencia y Conferencia de Llamadas",
    "Gestión de Trabajos y Equipo",
    "Control de Tiempo y Nómina",
    "Cobro con Stripe",
    "Automatizaciones SMS y Email",
    "Estimador de Tasa de Producción",
    "FuseAI Incluido (propuestas con IA, sentimiento, extracción de recibos y más)",
  ],
};

function getCategoriesI18n(lang: Lang) {
  const t = T[lang];
  return [
    { key: "insurance", label: t.insurance, icon: ShieldCheck },
    { key: "vehicle", label: t.vehicleFuel, icon: Car },
    { key: "operations", label: t.operations, icon: Wrench },
    { key: "marketing", label: t.marketing, icon: Megaphone },
    { key: "professional", label: t.professionalServices, icon: Briefcase },
    { key: "software", label: t.softwareSubscriptions, icon: Monitor },
    { key: "other", label: t.other, icon: MoreHorizontal },
  ] as const;
}

function getNonProdRolesI18n(lang: Lang): Record<string, string> {
  const t = T[lang];
  return {
    va: t.va,
    secretary: t.secretary,
    sales: t.sales,
    estimator: t.estimator,
    other: t.otherRole,
  };
}

const DEFAULT_EXPENSES = [
  { expenseName: "General Liability Insurance", expenseNameEs: "Seguro de Responsabilidad General", amount: 0, frequency: "yearly", category: "insurance" },
  { expenseName: "Workers Comp Insurance", expenseNameEs: "Seguro de Compensación Laboral", amount: 0, frequency: "yearly", category: "insurance" },
  { expenseName: "Commercial Auto Insurance", expenseNameEs: "Seguro de Auto Comercial", amount: 0, frequency: "yearly", category: "insurance" },
  { expenseName: "Vehicle Payment", expenseNameEs: "Pago del Vehículo", amount: 0, frequency: "monthly", category: "vehicle" },
  { expenseName: "Fuel", expenseNameEs: "Combustible", amount: 0, frequency: "monthly", category: "vehicle" },
  { expenseName: "Equipment / Tools Replacement", expenseNameEs: "Equipo / Herramientas", amount: 0, frequency: "monthly", category: "operations" },
  { expenseName: "Office Supplies", expenseNameEs: "Suministros de Oficina", amount: 0, frequency: "monthly", category: "operations" },
  { expenseName: "Storage / Warehouse", expenseNameEs: "Almacén / Bodega", amount: 0, frequency: "monthly", category: "operations" },
  { expenseName: "Marketing / Ads", expenseNameEs: "Mercadeo / Publicidad", amount: 0, frequency: "monthly", category: "marketing" },
  { expenseName: "Accounting / CPA", expenseNameEs: "Contabilidad / CPA", amount: 0, frequency: "monthly", category: "professional" },
  { expenseName: "Phone / Internet", expenseNameEs: "Teléfono / Internet", amount: 0, frequency: "monthly", category: "software" },
  { expenseName: "Software Subscriptions", expenseNameEs: "Suscripciones de Software", amount: 0, frequency: "monthly", category: "software" },
];

function calculateMonthlyEquivalent(amount: number, frequency: string): number {
  switch (frequency) {
    case "weekly": return amount * 4.33;
    case "quarterly": return amount / 3;
    case "yearly": return amount / 12;
    case "monthly":
    default: return amount;
  }
}

interface LocalExpense {
  expenseName: string;
  expenseNameEs: string;
  category: string;
  amount: number;
  frequency: string;
}

interface ProductionEmployee {
  name: string;
  hourlyRate: number;
  payrollBurden: number;
  workersComp: number;
  benefitsPerHour: number;
}

interface NonProductionEmployee {
  name: string;
  role: string;
  monthlyCost: number;
}

export default function PublicCalculator() {
  const { toast } = useToast();
  const [lang, setLang] = useState<Lang>(() => {
    try {
      const stored = localStorage.getItem("fusephone_calc_lang");
      if (stored === "es") return "es";
    } catch {}
    return "en";
  });

  useEffect(() => {
    try { localStorage.setItem("fusephone_calc_lang", lang); } catch {}
  }, [lang]);

  const t = T[lang];
  const CATEGORIES = getCategoriesI18n(lang);
  const NON_PRODUCTION_ROLES = getNonProdRolesI18n(lang);

  const [viewMode, setViewMode] = useState<"monthly" | "yearly">("monthly");
  const [targetNetProfit, setTargetNetProfit] = useState("20");
  const [localExpenses, setLocalExpenses] = useState<LocalExpense[]>(
    DEFAULT_EXPENSES.map(e => ({ expenseName: e.expenseName, expenseNameEs: e.expenseNameEs, category: e.category, amount: e.amount, frequency: e.frequency }))
  );

  const [productionEmployees, setProductionEmployees] = useState<ProductionEmployee[]>([
    { name: lang === "es" ? "Empleado 1" : "Employee 1", hourlyRate: 20, payrollBurden: 12, workersComp: 18, benefitsPerHour: 0 },
  ]);

  const [nonProductionEmployees, setNonProductionEmployees] = useState<NonProductionEmployee[]>([]);

  const crewSize = productionEmployees.length;

  const calculatedTrueLaborCost = useMemo(() => {
    if (productionEmployees.length === 0) return 0;
    const totalCost = productionEmployees.reduce((sum, emp) => {
      const burden = emp.hourlyRate * (emp.payrollBurden / 100);
      const wc = emp.hourlyRate * (emp.workersComp / 100);
      return sum + emp.hourlyRate + burden + wc + emp.benefitsPerHour;
    }, 0);
    return totalCost / productionEmployees.length;
  }, [productionEmployees]);

  const averageHourlyRate = useMemo(() => {
    if (productionEmployees.length === 0) return 0;
    return productionEmployees.reduce((sum, emp) => sum + emp.hourlyRate, 0) / productionEmployees.length;
  }, [productionEmployees]);

  const targetNetProfitValue = (parseFloat(targetNetProfit) || 0) / 100;

  const nonProdMonthlyTotal = useMemo(() => {
    return nonProductionEmployees.reduce((sum, emp) => sum + emp.monthlyCost, 0);
  }, [nonProductionEmployees]);

  const expenseMonthlyTotal = useMemo(() => {
    return localExpenses.reduce((sum, exp) => sum + calculateMonthlyEquivalent(exp.amount, exp.frequency), 0);
  }, [localExpenses]);

  const totalMonthlyOverhead = expenseMonthlyTotal + nonProdMonthlyTotal;

  const monthlyLaborCost = useMemo(() => {
    if (crewSize === 0 || calculatedTrueLaborCost <= 0) return 0;
    return calculatedTrueLaborCost * 160 * crewSize;
  }, [calculatedTrueLaborCost, crewSize]);

  const monthlyBreakEven = totalMonthlyOverhead + monthlyLaborCost;

  const overheadPerHour = useMemo(() => {
    if (crewSize === 0) return 0;
    return totalMonthlyOverhead / (160 * crewSize);
  }, [totalMonthlyOverhead, crewSize]);

  const autoSellRate = useMemo(() => {
    const netPct = targetNetProfitValue;
    if (netPct >= 1 || netPct < 0) return 0;
    if (calculatedTrueLaborCost <= 0 && overheadPerHour <= 0) return 0;
    return (calculatedTrueLaborCost + overheadPerHour) / (1 - netPct);
  }, [calculatedTrueLaborCost, overheadPerHour, targetNetProfitValue]);

  const grossMarginPercent = useMemo(() => {
    if (autoSellRate <= 0) return 0;
    return ((autoSellRate - calculatedTrueLaborCost) / autoSellRate) * 100;
  }, [autoSellRate, calculatedTrueLaborCost]);

  const monthlyRevenuePotential = useMemo(() => {
    if (crewSize === 0 || autoSellRate <= 0) return 0;
    return autoSellRate * 160 * crewSize;
  }, [autoSellRate, crewSize]);

  const monthlyNetProfit = monthlyRevenuePotential - monthlyBreakEven;
  const profitPerHour = autoSellRate - calculatedTrueLaborCost - overheadPerHour;
  const totalAvailableHours = 160 * crewSize;

  const hoursToBreakEven = useMemo(() => {
    if (autoSellRate <= 0) return 0;
    return monthlyBreakEven / autoSellRate;
  }, [monthlyBreakEven, autoSellRate]);

  const actualNetMargin = useMemo(() => {
    if (monthlyRevenuePotential <= 0) return 0;
    return (monthlyNetProfit / monthlyRevenuePotential) * 100;
  }, [monthlyNetProfit, monthlyRevenuePotential]);

  const netProfitColorClass = actualNetMargin >= 20 ? "text-emerald-600 dark:text-emerald-400" : actualNetMargin >= 10 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
  const netProfitBgClass = actualNetMargin >= 20 ? "bg-emerald-600 dark:bg-emerald-400" : actualNetMargin >= 10 ? "bg-amber-600 dark:bg-amber-400" : "bg-red-600 dark:bg-red-400";

  const m = viewMode === "yearly" ? 12 : 1;
  const periodLabel = viewMode === "yearly" ? (lang === "es" ? "año" : "yr") : (lang === "es" ? "mes" : "mo");
  const displayOverhead = totalMonthlyOverhead * m;
  const displayLabor = monthlyLaborCost * m;
  const displayBreakEven = monthlyBreakEven * m;
  const displayRevenue = monthlyRevenuePotential * m;
  const displayProfit = monthlyNetProfit * m;
  const displayAvailableHours = totalAvailableHours * m;
  const displayBreakEvenHours = hoursToBreakEven * m;

  const updateProductionEmployee = (index: number, field: keyof ProductionEmployee, value: any) => {
    setProductionEmployees(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: typeof value === 'string' ? (parseFloat(value) || 0) : value };
      return updated;
    });
  };

  const addProductionEmployee = () => {
    setProductionEmployees(prev => [
      ...prev,
      { name: lang === "es" ? `Empleado ${prev.length + 1}` : `Employee ${prev.length + 1}`, hourlyRate: 20, payrollBurden: 12, workersComp: 18, benefitsPerHour: 0 },
    ]);
  };

  const removeProductionEmployee = (index: number) => {
    setProductionEmployees(prev => prev.filter((_, i) => i !== index));
  };

  const addNonProductionEmployee = () => {
    setNonProductionEmployees(prev => [...prev, { name: "", role: "va", monthlyCost: 0 }]);
  };

  const updateNonProductionEmployee = (index: number, field: keyof NonProductionEmployee, value: any) => {
    setNonProductionEmployees(prev => {
      const updated = [...prev];
      if (field === 'monthlyCost') {
        updated[index] = { ...updated[index], [field]: parseFloat(value) || 0 };
      } else {
        updated[index] = { ...updated[index], [field]: value };
      }
      return updated;
    });
  };

  const removeNonProductionEmployee = (index: number) => {
    setNonProductionEmployees(prev => prev.filter((_, i) => i !== index));
  };

  const updateExpense = (index: number, field: keyof LocalExpense, value: any) => {
    setLocalExpenses(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const addExpense = (category: string) => {
    setLocalExpenses(prev => [...prev, { expenseName: "", expenseNameEs: "", category, amount: 0, frequency: "monthly" }]);
  };

  const removeExpense = (index: number) => {
    setLocalExpenses(prev => prev.filter((_, i) => i !== index));
  };

  const groupedExpenses = useMemo(() => {
    const groups: Record<string, (LocalExpense & { originalIndex: number })[]> = {};
    for (const cat of CATEGORIES) {
      groups[cat.key] = [];
    }
    localExpenses.forEach((exp, idx) => {
      const key = groups[exp.category] ? exp.category : "other";
      groups[key].push({ ...exp, originalIndex: idx });
    });
    return groups;
  }, [localExpenses, lang]);

  const handleDownloadPDF = () => {
    const lines = [
      lang === "es" ? "CALCULADORA DE GASTOS Y TARIFA - RESULTADOS" : "OVERHEAD & HOURLY RATE CALCULATOR - RESULTS",
      "=============================================",
      "",
      `${lang === "es" ? "Vista" : "View"}: ${viewMode === "yearly" ? (lang === "es" ? "Anual" : "Yearly") : (lang === "es" ? "Mensual" : "Monthly")}`,
      "",
      `--- ${lang === "es" ? "RESUMEN" : "SUMMARY"} ---`,
      `${t.overhead}/${periodLabel}: $${displayOverhead.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
      `${t.labor}/${periodLabel}: $${displayLabor.toLocaleString("en-US", { maximumFractionDigits: 0 })} (${crewSize} ${t.crew})`,
      `${t.sellRate}: $${autoSellRate.toFixed(2)}/hr`,
      `${t.breakEven}: $${displayBreakEven.toLocaleString("en-US", { maximumFractionDigits: 0 })}/${periodLabel}`,
      `${t.netProfit}: ${displayProfit >= 0 ? "" : "-"}$${Math.abs(displayProfit).toLocaleString("en-US", { maximumFractionDigits: 0 })}/${periodLabel} (${actualNetMargin.toFixed(1)}%)`,
      `${t.profit}/hr: ${profitPerHour >= 0 ? "" : "-"}$${Math.abs(profitPerHour).toFixed(2)}/hr`,
      `${t.breakEvenAt}: ${displayBreakEvenHours.toFixed(0)} hrs/${periodLabel}`,
      `${lang === "es" ? "Horas Disponibles" : "Available Hours"}: ${displayAvailableHours}`,
      "",
      `--- ${t.prodEmployees.toUpperCase()} ---`,
      ...productionEmployees.map((emp) => {
        const trueCost = emp.hourlyRate * (1 + emp.payrollBurden / 100 + emp.workersComp / 100) + emp.benefitsPerHour;
        return `${emp.name}: $${emp.hourlyRate}/hr | ${emp.payrollBurden}% burden | ${emp.workersComp}% WC | $${emp.benefitsPerHour}/hr benefits | ${t.trueCost}: $${trueCost.toFixed(2)}/hr`;
      }),
      `${t.avgTrueLaborCost}: $${calculatedTrueLaborCost.toFixed(2)}/hr`,
      `${t.netProfit} ${t.target}: ${targetNetProfit}% (${grossMarginPercent.toFixed(1)}% ${t.grossMargin.toLowerCase()})`,
      "",
      `--- ${t.overheadExpenses.toUpperCase()} ---`,
      ...localExpenses.filter(e => e.amount > 0).map(e => {
        const name = lang === "es" && e.expenseNameEs ? e.expenseNameEs : e.expenseName;
        return `${name}: $${e.amount} (${e.frequency}) = $${calculateMonthlyEquivalent(e.amount, e.frequency).toFixed(0)}/${lang === "es" ? "mes" : "mo"}`;
      }),
      `Total: $${expenseMonthlyTotal.toLocaleString("en-US", { maximumFractionDigits: 0 })}/${lang === "es" ? "mes" : "mo"}`,
      "",
      ...(nonProductionEmployees.length > 0 ? [
        `--- ${t.nonProdEmployees.toUpperCase()} ---`,
        ...nonProductionEmployees.map(emp =>
          `${emp.name || NON_PRODUCTION_ROLES[emp.role] || emp.role}: $${emp.monthlyCost.toLocaleString("en-US", { maximumFractionDigits: 0 })}/${lang === "es" ? "mes" : "mo"}`
        ),
        `Total: $${nonProdMonthlyTotal.toLocaleString("en-US", { maximumFractionDigits: 0 })}/${lang === "es" ? "mes" : "mo"}`,
        "",
      ] : []),
      "=============================================",
      "Generated by FusePhone - fusephone.com",
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "overhead-calculator-results.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: lang === "es" ? "Resultados descargados" : "Results downloaded" });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b px-4 py-3 flex items-center justify-between gap-3 sticky top-0 bg-background z-50">
        <div className="flex items-center gap-2">
          <FusePhoneLogoImage size="sm" />
          <span className="font-semibold text-sm" data-testid="text-header-brand-calc">FusePhone</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setLang(lang === "en" ? "es" : "en")}
            data-testid="button-lang-toggle"
            className="gap-1 px-2"
          >
            <Globe className="w-4 h-4" />
            {lang === "en" ? "ES" : "EN"}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={handleDownloadPDF} data-testid="button-download">
            <Download className="w-4 h-4 mr-1" />
            {t.download}
          </Button>
          <Button size="sm" onClick={() => window.location.href = "/auth"} data-testid="button-get-started-header">
            {t.getStarted}
          </Button>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto px-4 py-6 w-full space-y-6">
        <div className="space-y-3">
          <h1 className="text-2xl font-bold" data-testid="text-calc-title">{t.heroTitle}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t.heroSubtitle}
          </p>
        </div>

        <Card className="border-primary/20 bg-primary/5 dark:bg-primary/10" data-testid="card-how-it-works">
          <CardContent className="py-4 space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Calculator className="w-4 h-4 text-primary" />
              {t.howItWorks}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">{t.step1Title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{t.step1Desc}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">{t.step2Title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{t.step2Desc}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">{t.step3Title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{t.step3Desc}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-public-summary">
          <CardContent className="px-3 py-2.5">
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
              <div className="flex items-center gap-1.5" data-testid="metric-public-target-profit">
                <Target className={cn("w-3.5 h-3.5 shrink-0", netProfitColorClass)} />
                <span className="text-[10px] text-muted-foreground uppercase">{t.netProfit}</span>
                <span className={cn("text-sm font-bold tabular-nums", netProfitColorClass)}>{targetNetProfit}%</span>
                <span className={cn("inline-block w-2 h-2 rounded-full shrink-0", netProfitBgClass)} />
                <InfoTooltip text={t.netProfitTip} />
              </div>
              <div className="inline-flex items-center rounded-md border text-xs" data-testid="toggle-public-view-mode">
                <button
                  type="button"
                  onClick={() => setViewMode("monthly")}
                  className={`px-2.5 py-1 rounded-l-md transition-colors ${viewMode === "monthly" ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground"}`}
                  data-testid="button-public-monthly"
                >
                  {t.monthly}
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("yearly")}
                  className={`px-2.5 py-1 rounded-r-md transition-colors ${viewMode === "yearly" ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground"}`}
                  data-testid="button-public-yearly"
                >
                  {t.yearly}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <div data-testid="metric-public-overhead" className="flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-primary shrink-0" />
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase leading-none flex items-center gap-1">{t.overhead}/{periodLabel} <InfoTooltip text={t.overheadTip} /></p>
                  <p className="text-sm font-bold tabular-nums leading-tight">${displayOverhead.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p>
                </div>
              </div>
              <div data-testid="metric-public-labor" className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-primary shrink-0" />
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase leading-none flex items-center gap-1">{t.labor}/{periodLabel} <InfoTooltip text={t.laborTip} /></p>
                  <p className="text-sm font-bold tabular-nums leading-tight">${displayLabor.toLocaleString("en-US", { maximumFractionDigits: 0 })} <span className="text-[10px] font-normal text-muted-foreground">{crewSize} {t.crew}</span></p>
                </div>
              </div>
              <div data-testid="metric-public-sell-rate" className="flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-primary shrink-0" />
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase leading-none flex items-center gap-1">{t.sellRate} <InfoTooltip text={t.sellRateTip} /></p>
                  <p className="text-sm font-bold tabular-nums text-primary leading-tight">${autoSellRate.toFixed(2)}<span className="text-[10px] font-normal text-muted-foreground">/hr</span></p>
                </div>
              </div>
              <div data-testid="metric-public-break-even" className="flex items-center gap-1.5">
                <ArrowDownRight className="w-3.5 h-3.5 text-destructive shrink-0" />
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase leading-none flex items-center gap-1">{t.breakEven} <InfoTooltip text={t.breakEvenTip} /></p>
                  <p className="text-sm font-bold tabular-nums text-destructive leading-tight">${displayBreakEven.toLocaleString("en-US", { maximumFractionDigits: 0 })}<span className="text-[10px] font-normal text-muted-foreground">/{periodLabel}</span></p>
                </div>
              </div>
            </div>
            <div className={`flex items-center justify-between gap-2 mt-2 px-2.5 py-1.5 rounded-md ${displayProfit >= 0 ? 'bg-primary/5 dark:bg-primary/10' : 'bg-destructive/5 dark:bg-destructive/10'}`}>
              <div className="flex items-center gap-1" data-testid="metric-public-net-profit">
                {displayProfit >= 0 ? <ArrowUpRight className="w-3.5 h-3.5 text-primary" /> : <ArrowDownRight className="w-3.5 h-3.5 text-destructive" />}
                <span className="text-[10px] text-muted-foreground">{t.profit}</span>
                <span className={`text-sm font-bold tabular-nums ${displayProfit >= 0 ? "text-primary" : "text-destructive"}`}>
                  {displayProfit >= 0 ? "" : "-"}${Math.abs(displayProfit).toLocaleString("en-US", { maximumFractionDigits: 0 })}<span className="text-[10px] font-normal text-muted-foreground">/{periodLabel}</span>
                </span>
                <InfoTooltip text={t.profitTip} />
              </div>
              <div className="flex items-center gap-1" data-testid="metric-public-profit-hr">
                <span className="text-[10px] text-muted-foreground">{actualNetMargin.toFixed(1)}%</span>
                <span className={`text-xs font-semibold tabular-nums ${profitPerHour >= 0 ? "text-primary" : "text-destructive"}`}>
                  {profitPerHour >= 0 ? "" : "-"}${Math.abs(profitPerHour).toFixed(2)}<span className="text-[10px] font-normal text-muted-foreground">/hr</span>
                </span>
              </div>
            </div>
            <div className="mt-1.5 px-2.5 py-1.5 rounded-md bg-muted/50 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1" data-testid="metric-public-hours-break-even">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">{t.breakEvenAt}</span>
                  <span className="text-sm font-bold tabular-nums">{displayBreakEvenHours.toFixed(0)}<span className="text-[10px] font-normal text-muted-foreground"> {t.hrs}/{periodLabel}</span></span>
                  <InfoTooltip text={t.breakEvenHrsTip} />
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1" data-testid="metric-public-sell-all">
                  <Target className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[10px] text-muted-foreground">{t.sellAll} {displayAvailableHours} {t.hrs}</span>
                  <InfoTooltip text={t.sellAllTip} />
                </div>
                <span className="text-sm font-bold tabular-nums text-primary" data-testid="metric-public-sell-all-revenue">
                  ${displayRevenue.toLocaleString("en-US", { maximumFractionDigits: 0 })}<span className="text-[10px] font-normal text-muted-foreground">/{periodLabel}</span>
                </span>
              </div>
            </div>
            <div className="mt-2 pt-2 border-t space-y-2.5" data-testid="card-public-margin">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <Label className="text-xs text-muted-foreground">{t.netProfit}</Label>
                  <InfoTooltip text={t.netProfitSliderTip} />
                </div>
                <span className={cn("text-lg font-bold tabular-nums", netProfitColorClass)} data-testid="text-public-net-profit-pct">{targetNetProfit}%</span>
              </div>
              <Slider
                value={[parseFloat(targetNetProfit) || 0]}
                onValueChange={([v]) => setTargetNetProfit(v.toString())}
                min={0}
                max={60}
                step={1}
                data-testid="slider-public-target-net-profit"
              />
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>0%</span>
                <span>20% {t.target}</span>
                <span>60%</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-0.5 text-center">
                  <Label className="text-[10px] text-muted-foreground uppercase">{t.laborCost}</Label>
                  <p className="text-sm font-medium tabular-nums">${calculatedTrueLaborCost.toFixed(2)}<span className="text-[10px] font-normal text-muted-foreground">/hr</span></p>
                </div>
                <div className="space-y-0.5 text-center">
                  <Label className="text-[10px] text-muted-foreground uppercase">{t.sellRate}</Label>
                  <p className="text-sm font-bold tabular-nums text-primary" data-testid="text-public-sell-rate">${autoSellRate.toFixed(2)}<span className="text-[10px] font-normal text-muted-foreground">/hr</span></p>
                </div>
                <div className="space-y-0.5 text-center">
                  <Label className="text-[10px] text-muted-foreground uppercase">{t.grossMargin}</Label>
                  <p className={cn("text-sm font-bold tabular-nums", grossMarginPercent >= 45 ? "text-emerald-600 dark:text-emerald-400" : grossMarginPercent >= 30 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400")}>{grossMarginPercent.toFixed(1)}%</p>
                </div>
              </div>
              <div className="rounded-md bg-muted/50 p-2">
                <p className="text-[10px] text-muted-foreground text-center">
                  (${calculatedTrueLaborCost.toFixed(2)} {t.labor.toLowerCase()} + ${overheadPerHour.toFixed(2)} {t.overhead.toLowerCase()}) / (1 - {targetNetProfit}%) = ${autoSellRate.toFixed(2)}/hr
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-public-production">
          <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              <CardTitle>{t.prodEmployees}</CardTitle>
              <InfoTooltip text={t.prodEmployeesTip} />
            </div>
            <Button size="sm" variant="ghost" onClick={addProductionEmployee} data-testid="button-public-add-prod">
              <Plus className="w-4 h-4 mr-1" /> {t.addEmployee}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t.prodEmployeesDesc}
            </p>
            {productionEmployees.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">{t.noEmployees}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {productionEmployees.map((emp, index) => {
                  const trueCost = emp.hourlyRate * (1 + emp.payrollBurden / 100 + emp.workersComp / 100) + emp.benefitsPerHour;
                  return (
                    <div key={index} className="rounded-md border p-3 space-y-3" data-testid={`public-prod-emp-${index}`}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <Input
                          value={emp.name}
                          onChange={(e) => {
                            setProductionEmployees(prev => {
                              const u = [...prev];
                              u[index] = { ...u[index], name: e.target.value };
                              return u;
                            });
                          }}
                          placeholder={lang === "es" ? "Nombre del empleado" : "Employee name"}
                          className="max-w-[200px]"
                          data-testid={`input-public-prod-name-${index}`}
                        />
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" data-testid={`badge-public-true-cost-${index}`}>
                            {t.trueCost}: ${trueCost.toFixed(2)}/hr
                          </Badge>
                          <Button size="icon" variant="ghost" onClick={() => removeProductionEmployee(index)} data-testid={`button-public-remove-prod-${index}`}>
                            <Trash2 className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground flex items-center gap-1">{t.hourlyRate} <InfoTooltip text={t.hourlyRateTip} /></Label>
                          <Input type="number" step="0.01" min="0" value={emp.hourlyRate || ""} onChange={(e) => updateProductionEmployee(index, "hourlyRate", e.target.value)} placeholder="0.00" data-testid={`input-public-prod-rate-${index}`} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground flex items-center gap-1">{t.payrollBurden} <InfoTooltip text={t.payrollBurdenTip} /></Label>
                          <Input type="number" step="0.1" min="0" value={emp.payrollBurden || ""} onChange={(e) => updateProductionEmployee(index, "payrollBurden", e.target.value)} placeholder="12" data-testid={`input-public-prod-burden-${index}`} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground flex items-center gap-1">{t.workersComp} <InfoTooltip text={t.workersCompTip} /></Label>
                          <Input type="number" step="0.1" min="0" value={emp.workersComp || ""} onChange={(e) => updateProductionEmployee(index, "workersComp", e.target.value)} placeholder="18" data-testid={`input-public-prod-wc-${index}`} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground flex items-center gap-1">{t.benefits} <InfoTooltip text={t.benefitsTip} /></Label>
                          <Input type="number" step="0.01" min="0" value={emp.benefitsPerHour || ""} onChange={(e) => updateProductionEmployee(index, "benefitsPerHour", e.target.value)} placeholder="0.00" data-testid={`input-public-prod-benefits-${index}`} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="rounded-md bg-muted/50 p-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">{t.avgHourlyWage}</p>
                  <p className="text-sm font-bold tabular-nums" data-testid="text-public-avg-wage">${averageHourlyRate.toFixed(2)}/hr</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">{t.avgTrueLaborCost}</p>
                  <p className="text-sm font-bold tabular-nums text-primary" data-testid="text-public-true-cost">${calculatedTrueLaborCost.toFixed(2)}/hr</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">{t.crewSize}</p>
                  <p className="text-sm font-bold tabular-nums" data-testid="text-public-crew-size">{crewSize}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-public-non-production">
          <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-primary" />
              <CardTitle>{t.nonProdEmployees}</CardTitle>
              <InfoTooltip text={t.nonProdEmployeesTip} />
            </div>
            <Button size="sm" variant="ghost" onClick={addNonProductionEmployee} data-testid="button-public-add-nonprod">
              <Plus className="w-4 h-4 mr-1" /> {t.addEmployee}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t.nonProdEmployeesDesc}
            </p>
            {nonProductionEmployees.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                <p className="text-sm">{t.noNonProd}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {nonProductionEmployees.map((emp, index) => {
                  return (
                    <div key={index} className="rounded-md border p-3 space-y-2" data-testid={`public-nonprod-emp-${index}`}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <Select value={emp.role} onValueChange={(v) => updateNonProductionEmployee(index, "role", v)}>
                            <SelectTrigger className="w-[160px] shrink-0" data-testid={`select-public-nonprod-role-${index}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(NON_PRODUCTION_ROLES).map(([key, label]) => (
                                <SelectItem key={key} value={key}>{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" data-testid={`badge-public-nonprod-monthly-${index}`}>
                            ${emp.monthlyCost.toLocaleString("en-US", { maximumFractionDigits: 0 })}/{lang === "es" ? "mes" : "mo"}
                          </Badge>
                          <Button size="icon" variant="ghost" onClick={() => removeNonProductionEmployee(index)} data-testid={`button-public-remove-nonprod-${index}`}>
                            <Trash2 className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">{t.monthlyCost}</Label>
                        <Input type="number" step="1" min="0" value={emp.monthlyCost || ""} onChange={(e) => updateNonProductionEmployee(index, "monthlyCost", e.target.value)} placeholder="0" data-testid={`input-public-nonprod-cost-${index}`} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {nonProductionEmployees.length > 0 && (
              <div className="rounded-md bg-muted/50 p-3 flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">{t.totalNonProdCost}</span>
                <span className="text-sm font-bold tabular-nums" data-testid="text-public-nonprod-total">
                  ${nonProdMonthlyTotal.toLocaleString("en-US", { maximumFractionDigits: 0 })}/{lang === "es" ? "mes" : "mo"}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <div>
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div className="flex items-center gap-2">
              <Calculator className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold" data-testid="text-public-overhead-title">{t.overheadExpenses}</h2>
              <InfoTooltip text={t.overheadExpensesTip} />
            </div>
            <Badge variant="secondary" data-testid="badge-public-total-monthly">
              ${expenseMonthlyTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/{lang === "es" ? "mes" : "mo"}
            </Badge>
          </div>

          <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
            {t.overheadExpensesDesc}
          </p>

          <div className="space-y-4">
            {CATEGORIES.map(cat => {
              const catExpenses = groupedExpenses[cat.key] || [];
              const catTotal = catExpenses.reduce((sum, exp) => sum + calculateMonthlyEquivalent(exp.amount, exp.frequency), 0);
              return (
                <Card key={cat.key} data-testid={`card-public-category-${cat.key}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <cat.icon className="w-4 h-4 text-muted-foreground" />
                        <CardTitle className="text-base">{cat.label}</CardTitle>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          ${catTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/{lang === "es" ? "mes" : "mo"}
                        </Badge>
                        <Button size="sm" variant="ghost" onClick={() => addExpense(cat.key)} data-testid={`button-public-add-${cat.key}`}>
                          <Plus className="w-4 h-4 mr-1" /> {t.addEmployee}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {catExpenses.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-3">{t.noExpenses}</p>
                    ) : (
                      <div className="space-y-3">
                        {catExpenses.map((exp) => (
                          <div key={exp.originalIndex} className="rounded-md border shadow-sm p-3 space-y-1.5" data-testid={`public-expense-row-${exp.originalIndex}`}>
                            <Input
                              value={lang === "es" && exp.expenseNameEs ? exp.expenseNameEs : exp.expenseName}
                              onChange={(e) => {
                                if (lang === "es") {
                                  updateExpense(exp.originalIndex, "expenseNameEs", e.target.value);
                                } else {
                                  updateExpense(exp.originalIndex, "expenseName", e.target.value);
                                }
                              }}
                              placeholder={lang === "es" ? "Nombre del gasto" : "Expense name"}
                              data-testid={`input-public-expense-name-${exp.originalIndex}`}
                            />
                            <div className="flex items-center gap-2">
                              <div className="relative flex-1">
                                <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                                <Input
                                  type="number"
                                  value={exp.amount || ""}
                                  onChange={(e) => updateExpense(exp.originalIndex, "amount", parseFloat(e.target.value) || 0)}
                                  className="pl-6"
                                  placeholder="0"
                                  data-testid={`input-public-expense-amount-${exp.originalIndex}`}
                                />
                              </div>
                              <Select value={exp.frequency} onValueChange={(v) => updateExpense(exp.originalIndex, "frequency", v)}>
                                <SelectTrigger className="w-28 shrink-0" data-testid={`select-public-expense-freq-${exp.originalIndex}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="weekly">{t.weekly}</SelectItem>
                                  <SelectItem value="monthly">{t.monthlyFreq}</SelectItem>
                                  <SelectItem value="quarterly">{t.quarterly}</SelectItem>
                                  <SelectItem value="yearly">{t.yearlyFreq}</SelectItem>
                                </SelectContent>
                              </Select>
                              <Button size="icon" variant="ghost" onClick={() => removeExpense(exp.originalIndex)} data-testid={`button-public-delete-expense-${exp.originalIndex}`}>
                                <Trash2 className="w-4 h-4 text-muted-foreground" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        <Card className="border-primary/20" data-testid="card-download-cta">
          <CardContent className="py-6 text-center space-y-3">
            <Download className="w-8 h-8 text-primary mx-auto" />
            <h3 className="font-semibold text-lg">{t.downloadTitle}</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {t.downloadDesc}
            </p>
            <Button onClick={handleDownloadPDF} data-testid="button-download-results">
              <Download className="w-4 h-4 mr-2" />
              {t.downloadBtn}
            </Button>
          </CardContent>
        </Card>

        <div className="pt-8 pb-4" data-testid="section-plans">
          <div className="text-center space-y-2 mb-8">
            <h2 className="text-2xl font-bold" data-testid="text-plans-title">{t.plansTitle}</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              {t.plansDesc}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card data-testid="card-plan-starter">
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-lg">Starter</CardTitle>
                <div className="mt-1">
                  <span className="text-3xl font-bold" data-testid="text-price-starter">$39.99</span>
                  <span className="text-muted-foreground text-sm">/{lang === "es" ? "mes" : "mo"}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{t.freeTrial3}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {STARTER_FEATURES_I18N[lang].map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button className="w-full" variant="outline" onClick={() => window.location.href = "/auth"} data-testid="button-plan-starter">
                  {t.getStarted} <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </CardContent>
            </Card>

            <Card className="border-primary/30 relative" data-testid="card-plan-core">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge data-testid="badge-popular">{t.mostPopular}</Badge>
              </div>
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-lg">Core</CardTitle>
                <div className="mt-1">
                  <span className="text-3xl font-bold" data-testid="text-price-core">$89.99</span>
                  <span className="text-muted-foreground text-sm">/{lang === "es" ? "mes" : "mo"}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{t.freeTrial15}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {CORE_FEATURES_I18N[lang].map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button className="w-full" onClick={() => window.location.href = "/auth"} data-testid="button-plan-core">
                  {t.getStarted} <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </CardContent>
            </Card>

            <Card data-testid="card-plan-elite">
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-lg flex items-center justify-center gap-1.5">
                  Elite <Zap className="w-4 h-4 text-primary" />
                </CardTitle>
                <div className="mt-1">
                  <span className="text-3xl font-bold" data-testid="text-price-elite">$149</span>
                  <span className="text-muted-foreground text-sm">/{lang === "es" ? "mes" : "mo"}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{t.freeTrial15}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {ELITE_FEATURES_I18N[lang].map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button className="w-full" variant="outline" onClick={() => window.location.href = "/auth"} data-testid="button-plan-elite">
                  {t.getStarted} <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        <footer className="border-t pt-6 pb-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <FusePhoneLogoImage size="sm" />
            <span className="font-semibold text-sm">FusePhone</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {t.footerText}
          </p>
        </footer>
      </main>
    </div>
  );
}
