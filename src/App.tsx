import { useState, useMemo, ReactNode, useEffect, useRef } from 'react';
import { 
  Wrench, 
  Gauge, 
  Shield, 
  Disc, 
  Settings2, 
  Zap, 
  Package, 
  Truck, 
  MapPin, 
  Plus, 
  Minus, 
  Trash2, 
  ChevronRight,
  Info,
  CheckCircle2,
  AlertTriangle,
  X,
  ChevronUp,
  ChevronDown,
  LogOut,
  User,
  Fan,
  Dna,
  Joystick
} from 'lucide-react';
import { motion, AnimatePresence, useScroll, useMotionValueEvent } from 'motion/react';

// --- Constants & Prices ---
const PRICES = {
  upgrades: {
    turbo: 30000,
    motor: 20000,
    freios: 8200,
    transmissao: 10000,
    suspensao: 7500,
    blindagem: 30000,
  },
  items: {
    reparoBasico: 300,
    reparoAvancado: 750,
    pneu: 300,
  },
  avulsos: {
    chaveInglesa: 1200,
    elevador: 3000,
    rastreador: 15000,
    exaustor: 6000,
  },
  servicos: {
    km: 500,
    reparoExterno: 400,
    trocaPneuExterna: 300,
  }
};

const LIMITS = {
  reparoBasico: 3,
  reparoAvancado: 3,
  pneu: 4,
  avulsos: 10, // Default limit for avulsos
};

export default function App() {
  // --- State ---
  const [upgrades, setUpgrades] = useState({
    turboEnabled: false,
    motor: 0,
    freios: 0,
    transmissao: 0,
    suspensao: 0,
    blindagem: 0,
  });

  const [items, setItems] = useState({
    reparoBasico: 0,
    reparoAvancado: 0,
    pneu: 0,
  });

  const [avulsos, setAvulsos] = useState({
    chaveInglesa: 0,
    elevador: 0,
    rastreador: 0,
    exaustor: 0,
  });

  const [servicos, setServicos] = useState({
    distancia: 0,
    reparoExterno: false,
    trocaPneuExterna: false,
  });

  const [headerVisible, setHeaderVisible] = useState(true);
  const [activeTab, setActiveTab] = useState<'upgrades' | 'items' | 'services' | 'summary' | 'mechanic'>('upgrades');
  const [toasts, setToasts] = useState<{ id: number, message: string, type: 'success' | 'warning' | 'info' }[]>([]);
  const [user, setUser] = useState<{ id: string, username: string, avatar: string | null, displayName?: string, roles?: string[] } | null>(null);
  const [goals, setGoals] = useState({ money: 15000, dailyItems: 100, weeklyItems: 600 });
  
  // Tutorial State
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [tutorialPosition, setTutorialPosition] = useState({ top: 0, left: 0, width: 0, height: 0 });

  useEffect(() => {
    if (user) {
      const hasSeen = localStorage.getItem('summer_garage_tutorial_seen');
      if (!hasSeen) {
        // Delay tutorial to ensure UI is rendered and login overlay is gone
        const timer = setTimeout(() => {
          setShowTutorial(true);
        }, 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [user]);

  useEffect(() => {
    if (showTutorial && window.innerWidth < 1024) {
      const step = tutorialSteps[tutorialStep];
      if (step.tab) {
        setActiveTab(step.tab as any);
      }
    }
  }, [tutorialStep, showTutorial]);

  useEffect(() => {
    if (showTutorial) {
      const step = tutorialSteps[tutorialStep];
      const element = document.getElementById(step.target);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [tutorialStep, showTutorial]);

  useEffect(() => {
    const updatePosition = () => {
      if (showTutorial) {
        const step = tutorialSteps[tutorialStep];
        let element = document.getElementById(step.target);
        
        // Fallback for hidden elements (like mobile tabs on desktop)
        if (!element) {
          element = document.querySelector('main');
        }

        if (element) {
          const rect = element.getBoundingClientRect();
          // If element is not visible (width/height 0), try to find a visible parent or fallback
          if (rect.width === 0 || rect.height === 0) {
            const main = document.querySelector('main');
            if (main) {
              const mainRect = main.getBoundingClientRect();
              setTutorialPosition({
                top: mainRect.top + 100,
                left: mainRect.left + (mainRect.width / 2) - 50,
                width: 100,
                height: 100
              });
            } else {
              setTutorialPosition({
                top: window.innerHeight / 2 - 50,
                left: window.innerWidth / 2 - 50,
                width: 100,
                height: 100
              });
            }
          } else {
            setTutorialPosition({
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height
            });
          }
        }
      }
    };

    updatePosition();
    
    // Use ResizeObserver for more accurate tracking
    const observer = new ResizeObserver(updatePosition);
    const elements = tutorialSteps.map(s => document.getElementById(s.target)).filter(Boolean) as HTMLElement[];
    elements.forEach(el => observer.observe(el));

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, { passive: true });
    
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition);
    };
  }, [tutorialStep, showTutorial]);

  const closeTutorial = () => {
    setShowTutorial(false);
    localStorage.setItem('summer_garage_tutorial_seen', 'true');
  };

  const tutorialSteps = [
    {
      title: "Bem-vindo à Summer Garage!",
      content: "Este é o seu novo painel de mecânico. Vamos te mostrar como tudo funciona para você ser o melhor mecânico da cidade.",
      target: "tutorial-header",
      tab: "upgrades"
    },
    {
      title: "Calculadora Inteligente",
      content: "Aqui você seleciona o que o cliente quer. O sistema soma tudo em tempo real, sem você precisar de calculadora externa.",
      target: "tutorial-calculator",
      tab: "upgrades"
    },
    {
      title: "Resumo da Fatura",
      content: "Confira o valor total aqui. Você pode ver o subtotal de cada categoria para explicar ao cliente.",
      target: "tutorial-summary",
      tab: "summary"
    },
    {
      title: "Perfil do Mecânico",
      content: "Este é o seu espaço pessoal. Aqui você acompanha seu progresso e obrigações com a oficina.",
      target: "tutorial-mechanic",
      tab: "mechanic"
    },
    {
      title: "Metas de Farm",
      content: "Acompanhe quanto você já farmou no dia e na semana. O sistema mostra o progresso em relação às metas estabelecidas.",
      target: "tutorial-daily-farm",
      tab: "mechanic"
    },
    {
      title: "Lançamento Manual",
      content: "Fez um farm? Digite a quantidade aqui e clique em OK. Ele soma automaticamente no seu total diário e semanal.",
      target: "tutorial-manual-farm",
      tab: "mechanic"
    },
    {
      title: "Status Financeiro",
      content: "Clique aqui para marcar se sua meta semanal está Pendente, Em Dia ou Paga. Mantenha isso atualizado!",
      target: "tutorial-finance-status",
      tab: "mechanic"
    },
    {
      title: "Itens Necessários",
      content: "Estes são os itens que você deve focar no seu farm para manter o estoque da oficina em dia.",
      target: "tutorial-items-list",
      tab: "mechanic"
    }
  ];
  
  // Persistent Mechanic State
  const [mechanicState, setMechanicState] = useState(() => {
    const saved = localStorage.getItem('summer_garage_mechanic_state');
    const defaultState = {
      dailyFarm: 0,
      weeklyFarm: 0,
      financeStatus: 'PENDENTE' as 'PENDENTE' | 'EM DIA' | 'PAGA',
      lastUpdate: new Date().toISOString(),
      lastDailyReset: new Date().toISOString(),
      lastWeeklyReset: new Date().toISOString()
    };

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const now = new Date();
        const lastDaily = new Date(parsed.lastDailyReset || parsed.lastUpdate);
        const lastWeekly = new Date(parsed.lastWeeklyReset || parsed.lastUpdate);

        // Check Daily Reset (if different day)
        if (now.getDate() !== lastDaily.getDate() || now.getMonth() !== lastDaily.getMonth()) {
          parsed.dailyFarm = 0;
          parsed.lastDailyReset = now.toISOString();
        }

        // Check Weekly Reset (if different week - using Monday as start)
        const getWeekNumber = (d: Date) => {
          const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
          date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
          const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
          return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
        };

        if (getWeekNumber(now) !== getWeekNumber(lastWeekly)) {
          parsed.weeklyFarm = 0;
          parsed.lastWeeklyReset = now.toISOString();
        }

        return parsed;
      } catch (e) {
        return defaultState;
      }
    }
    return defaultState;
  });

  useEffect(() => {
    localStorage.setItem('summer_garage_mechanic_state', JSON.stringify(mechanicState));
  }, [mechanicState]);

  const [farmInput, setFarmInput] = useState('');

  const handleAddFarm = () => {
    const amount = parseInt(farmInput);
    if (!isNaN(amount) && amount > 0) {
      setMechanicState((prev: any) => ({
        ...prev,
        dailyFarm: prev.dailyFarm + amount,
        weeklyFarm: prev.weeklyFarm + amount,
        lastUpdate: new Date().toISOString()
      }));
      setFarmInput('');
      addToast(`Adicionado ${amount} itens ao farm!`, 'success');
    }
  };

  const resetDailyFarm = () => {
    setMechanicState((prev: any) => ({ ...prev, dailyFarm: 0 }));
    addToast('Farm diário resetado!', 'info');
  };

  const resetWeeklyFarm = () => {
    setMechanicState((prev: any) => ({ ...prev, weeklyFarm: 0 }));
    addToast('Farm semanal resetado!', 'info');
  };

  const toggleFinanceStatus = () => {
    const statuses: ('PENDENTE' | 'EM DIA' | 'PAGA')[] = ['PENDENTE', 'EM DIA', 'PAGA'];
    const currentIndex = statuses.indexOf(mechanicState.financeStatus);
    const nextStatus = statuses[(currentIndex + 1) % statuses.length];
    setMechanicState((prev: any) => ({ ...prev, financeStatus: nextStatus }));
  };
  const { scrollY } = useScroll();
  
  const tabsRef = useRef<HTMLDivElement>(null);
  const tabsContentRef = useRef<HTMLDivElement>(null);
  const [dragConstraints, setDragConstraints] = useState({ left: 0, right: 0 });

  const fetchUser = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else {
        setUser(null);
      }
    } catch (e) {
      setUser(null);
    }
  };

  const fetchGoals = async () => {
    try {
      const res = await fetch('/api/goals');
      if (res.ok) {
        const data = await res.json();
        setGoals(data);
      }
    } catch (e) {
      console.error('Error fetching goals');
    }
  };

  useEffect(() => {
    fetchGoals();
  }, []);

  useEffect(() => {
    if (!user) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [user]);

  useEffect(() => {
    fetchUser();
    
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        fetchUser();
        addToast('Login realizado com sucesso!', 'success');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleLogin = async () => {
    try {
      const res = await fetch('/api/auth/url');
      const { url } = await res.json();
      // Redirect directly instead of opening a popup
      window.location.href = url;
    } catch (e) {
      addToast('Erro ao iniciar login', 'warning');
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout');
      setUser(null);
      addToast('Sessão encerrada');
    } catch (e) {
      addToast('Erro ao sair', 'warning');
    }
  };

  useEffect(() => {
    const updateConstraints = () => {
      if (tabsRef.current && tabsContentRef.current) {
        const containerWidth = tabsRef.current.offsetWidth;
        const contentWidth = tabsContentRef.current.scrollWidth;
        // The contentWidth includes the padding we add to the motion.div
        setDragConstraints({ 
          left: -(contentWidth - containerWidth), 
          right: 0 
        });
      }
    };

    updateConstraints();
    window.addEventListener('resize', updateConstraints);
    return () => window.removeEventListener('resize', updateConstraints);
  }, []);

  const addToast = (message: string, type: 'success' | 'warning' | 'info' = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  useMotionValueEvent(scrollY, "change", (latest) => {
    const previous = scrollY.getPrevious() ?? 0;
    if (latest > previous && latest > 100) {
      setHeaderVisible(false);
    } else {
      setHeaderVisible(true);
    }
  });

  // Prevent copy/paste (Disabled for testing)
  useEffect(() => {
    return () => {};
  }, []);

  // --- Calculations ---
  const totals = useMemo(() => {
    const subtotalUpgrades = 
      (upgrades.turboEnabled ? PRICES.upgrades.turbo : 0) +
      (upgrades.motor * PRICES.upgrades.motor) +
      (upgrades.freios * PRICES.upgrades.freios) +
      (upgrades.transmissao * PRICES.upgrades.transmissao) +
      (upgrades.suspensao * PRICES.upgrades.suspensao) +
      (upgrades.blindagem * PRICES.upgrades.blindagem);

    const subtotalItems = 
      (items.reparoBasico * PRICES.items.reparoBasico) +
      (items.reparoAvancado * PRICES.items.reparoAvancado) +
      (items.pneu * PRICES.items.pneu) +
      (avulsos.chaveInglesa * PRICES.avulsos.chaveInglesa) +
      (avulsos.elevador * PRICES.avulsos.elevador) +
      (avulsos.rastreador * PRICES.avulsos.rastreador) +
      (avulsos.exaustor * PRICES.avulsos.exaustor);

    const subtotalServicos = 
      (servicos.distancia * PRICES.servicos.km) +
      (servicos.reparoExterno ? PRICES.servicos.reparoExterno : 0) +
      (servicos.trocaPneuExterna ? PRICES.servicos.trocaPneuExterna : 0);

    return {
      upgrades: subtotalUpgrades,
      items: subtotalItems,
      servicos: subtotalServicos,
      total: subtotalUpgrades + subtotalItems + subtotalServicos
    };
  }, [upgrades, items, avulsos, servicos]);

  // --- Handlers ---
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { 
      style: 'currency', 
      currency: 'USD',
      currencyDisplay: 'narrowSymbol' 
    }).format(value).replace('US$', '$');
  };

  const updateUpgrade = (key: keyof typeof upgrades, value: number | boolean) => {
    setUpgrades(prev => ({ ...prev, [key]: value }));
  };

  const updateItemCount = (key: keyof typeof items, delta: number) => {
    setItems(prev => {
      const limit = LIMITS[key];
      const nextValue = prev[key] + delta;
      
      if (delta > 0 && nextValue > limit) {
        addToast(`Limite máximo de ${limit} atingido para este item!`, 'warning');
        return prev;
      }
      
      const newValue = Math.max(0, Math.min(limit, nextValue));
      return { ...prev, [key]: newValue };
    });
  };

  const updateAvulsoCount = (key: keyof typeof avulsos, delta: number) => {
    setAvulsos(prev => {
      const limit = LIMITS.avulsos;
      const nextValue = prev[key] + delta;

      if (delta > 0 && nextValue > limit) {
        addToast(`Limite máximo de ${limit} atingido para itens avulsos!`, 'warning');
        return prev;
      }

      const newValue = Math.max(0, Math.min(limit, nextValue));
      return { ...prev, [key]: newValue };
    });
  };

  const resetAll = () => {
    setUpgrades({ turboEnabled: false, motor: 0, freios: 0, transmissao: 0, suspensao: 0, blindagem: 0 });
    setItems({ reparoBasico: 0, reparoAvancado: 0, pneu: 0 });
    setAvulsos({ chaveInglesa: 0, elevador: 0, rastreador: 0, exaustor: 0 });
    setServicos({ distancia: 0, reparoExterno: false, trocaPneuExterna: false });
    addToast('Orçamento limpo com sucesso!', 'success');
  };

  return (
    <div className="min-h-screen bg-zinc-950 pb-32 md:pb-0 md:pl-0 relative overflow-x-hidden">
      {/* Background Texture */}
      <motion.div 
        animate={{ 
          scale: [1, 1.05, 1],
          rotate: [0, 1, -1, 0],
          opacity: [0.02, 0.04, 0.02]
        }}
        transition={{
          duration: 30,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className="fixed inset-0 pointer-events-none z-0 flex items-center justify-center overflow-hidden"
        style={{
          backgroundImage: `url('https://pub-a1b327e0f0794695b6f7d05baa938672.r2.dev/image.png')`,
          backgroundSize: '90%',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
        }}
      />

      {/* Login Overlay (Modal) */}
      <AnimatePresence>
        {!user && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-xl"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="max-w-md w-full bg-zinc-900/40 backdrop-blur-md border border-zinc-800 p-8 rounded-[2.5rem] relative overflow-hidden group shadow-2xl shadow-black/50"
            >
              {/* Refraction effect */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-100 pointer-events-none" />
              
              <div className="relative z-10 flex flex-col items-center text-center space-y-8">
                <div className="relative">
                  <motion.div 
                    animate={{ 
                      y: [0, -10, 0],
                      rotate: [12, 15, 12]
                    }}
                    transition={{
                      duration: 4,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                    className="w-24 h-24 bg-red-600 rounded-3xl flex items-center justify-center shadow-lg shadow-red-900/40"
                  >
                    <AlertTriangle size={48} className="text-white" />
                  </motion.div>
                  <motion.div 
                    animate={{ 
                      scale: [1, 1.2, 1],
                      opacity: [0.8, 1, 0.8]
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                    className="absolute -top-2 -right-2 bg-zinc-950 border border-zinc-800 p-2 rounded-xl shadow-lg"
                  >
                    <Zap size={16} className="text-red-500 fill-red-500" />
                  </motion.div>
                </div>

                <div className="space-y-2">
                  <h2 className="text-3xl font-black text-white uppercase tracking-tighter italic leading-none">
                    Acesso <span className="text-red-600">Restrito</span>
                  </h2>
                  <p className="text-zinc-400 text-sm font-medium leading-relaxed">
                    Esta ferramenta é exclusiva para os mecânicos da <span className="text-white font-bold">Summer Garage</span>. Vincule seu Discord para continuar.
                  </p>
                </div>

                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  animate={{ 
                    boxShadow: ["0 0 0 0px rgba(239, 68, 68, 0)", "0 0 0 10px rgba(239, 68, 68, 0.1)", "0 0 0 0px rgba(239, 68, 68, 0)"]
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                  onClick={handleLogin}
                  className="w-full bg-red-600 hover:bg-red-700 text-white py-4 rounded-2xl font-black uppercase tracking-tighter text-lg shadow-lg shadow-red-900/20 transition-all flex items-center justify-center gap-3 group/btn"
                >
                  <User size={20} className="group-hover/btn:scale-110 transition-transform" />
                  Vincular Discord
                </motion.button>

                <div className="space-y-1">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-[0.2em] font-bold">
                    Summer Garage - 2026 • Mecânica Especializada
                  </p>
                  <p className="text-[8px] text-zinc-700 uppercase tracking-[0.2em] font-bold">
                    Alek &copy; All rights reserved
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <motion.header 
        id="tutorial-header"
        initial={{ y: 0 }}
        animate={{ y: headerVisible ? 0 : -100 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        className="bg-zinc-900/80 border-b border-zinc-800 sticky top-0 z-40 backdrop-blur-md"
      >
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img 
              src="https://pub-a1b327e0f0794695b6f7d05baa938672.r2.dev/image.png" 
              alt="Summer Garage Logo" 
              className="h-14 w-auto object-contain"
              referrerPolicy="no-referrer"
            />
            <div className="hidden sm:block border-l border-zinc-700 pl-4">
              <h1 className="text-lg font-black tracking-tighter text-white uppercase italic leading-none">
                Summer <span className="text-red-600">Garage</span>
              </h1>
              <p className="text-[9px] text-zinc-500 uppercase tracking-[0.2em] font-bold mt-1">Mecânica Especializada</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {user && (
              <div className="hidden sm:flex items-center gap-3 bg-zinc-900/50 border border-zinc-800 px-3 py-1.5 rounded-full">
                <div className="w-6 h-6 rounded-full overflow-hidden border border-red-600">
                  <img 
                    src={user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : `https://cdn.discordapp.com/embed/avatars/0.png`} 
                    alt={user.username}
                    className="w-full h-full object-cover"
                  />
                </div>
                <span className="text-xs font-bold text-zinc-300">{user.username}</span>
                <button onClick={handleLogout} className="text-zinc-500 hover:text-red-500 transition-colors">
                  <LogOut size={14} />
                </button>
              </div>
            )}
            <a 
              href="https://discord.gg/summergg" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hover:opacity-80 transition-opacity"
          >
            <img 
              src="https://pub-a1b327e0f0794695b6f7d05baa938672.r2.dev/Summer_-_Extenso_1_4000x959.png" 
              alt="Summer Discord" 
              className="h-6 sm:h-8 w-auto object-contain"
              referrerPolicy="no-referrer"
            />
          </a>
        </div>
      </div>
    </motion.header>

      <main className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">
        {/* Mobile Tab Switcher */}
        <div id="tutorial-tabs" className="lg:col-span-12 lg:h-1">
          <div className="lg:hidden sticky top-20 z-30 bg-zinc-950/95 backdrop-blur-sm -mx-4 px-4 py-3 border-b border-zinc-800 overflow-hidden" ref={tabsRef}>
            <motion.div 
              ref={tabsContentRef}
              drag="x"
              dragConstraints={dragConstraints}
              dragElastic={0.1}
              className="flex items-center gap-2 cursor-grab active:cursor-grabbing w-max pr-10"
            >
              {[
                { id: 'upgrades', label: 'Upgrades', icon: <Zap size={16} /> },
                { id: 'items', label: 'Itens', icon: <Package size={16} /> },
                { id: 'services', label: 'Serviços', icon: <Truck size={16} /> },
                { id: 'summary', label: 'Resumo', icon: <Settings2 size={16} /> },
                { id: 'mechanic', label: 'Mecânico', icon: <User size={16} /> },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  onPointerDown={(e) => e.stopPropagation()}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all
                    ${activeTab === tab.id 
                      ? 'bg-red-600 text-white shadow-lg shadow-red-900/20' 
                      : 'bg-zinc-900 text-zinc-400 border border-zinc-800'}
                  `}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </motion.div>
          </div>
        </div>

        {/* Left Column: Controls */}
        <AnimatePresence mode="wait">
          <motion.div 
            key={activeTab === 'summary' || activeTab === 'mechanic' ? 'side' : 'main'}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            id="tutorial-calculator" 
            className={`lg:col-span-8 space-y-8 ${(activeTab === 'summary' || activeTab === 'mechanic') ? 'hidden lg:block' : ''}`}
          >
          
          {/* Section: Upgrades */}
          <section className={`space-y-4 ${activeTab !== 'upgrades' ? 'hidden lg:block' : ''}`}>
            <div className="flex items-center gap-2 text-red-500">
              <Zap size={20} />
              <h2 className="text-lg font-bold uppercase tracking-tight">Upgrades de Performance</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Turbo - Checkbox Only */}
              <div 
                onClick={() => updateUpgrade('turboEnabled', !upgrades.turboEnabled)}
                className={`bg-zinc-900/40 backdrop-blur-md border p-5 rounded-2xl flex flex-col justify-between cursor-pointer transition-all h-full relative overflow-hidden group ${upgrades.turboEnabled ? 'border-red-600 ring-1 ring-red-600 shadow-lg shadow-red-900/10' : 'border-zinc-800 hover:border-zinc-700'}`}
              >
                {/* Refraction effect */}
                <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                
                <div className="flex items-center justify-between w-full relative z-10">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg transition-colors ${upgrades.turboEnabled ? 'bg-red-600 text-white' : 'bg-zinc-800 text-red-500'}`}>
                      <Fan size={18} />
                    </div>
                    <div>
                      <h3 className="font-bold text-zinc-200">Instalar Turbo</h3>
                      <p className="text-xs text-zinc-500">Nível Único</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold transition-colors ${upgrades.turboEnabled ? 'text-red-500' : 'text-zinc-600'}`}>
                      {formatCurrency(PRICES.upgrades.turbo)}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center justify-between bg-zinc-800/50 p-3 rounded-xl border border-zinc-800/50">
                  <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Status da Instalação</span>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${upgrades.turboEnabled ? 'bg-red-600 border-red-600' : 'border-zinc-700'}`}>
                    {upgrades.turboEnabled && <Plus size={14} className="text-white" strokeWidth={4} />}
                  </div>
                </div>
              </div>

              {/* Motor */}
              <UpgradeCard 
                icon={<Gauge size={18} />} 
                title="Motor" 
                price={PRICES.upgrades.motor} 
                value={upgrades.motor} 
                onChange={(v) => updateUpgrade('motor', v)} 
              />
              
              {/* Freios */}
              <UpgradeCard 
                icon={<Disc size={18} />} 
                title="Freios" 
                price={PRICES.upgrades.freios} 
                value={upgrades.freios} 
                onChange={(v) => updateUpgrade('freios', v)} 
              />

              {/* Transmissão */}
              <UpgradeCard 
                icon={<Joystick size={18} />} 
                title="Transmissão" 
                price={PRICES.upgrades.transmissao} 
                value={upgrades.transmissao} 
                onChange={(v) => updateUpgrade('transmissao', v)} 
              />

              {/* Suspensão */}
              <UpgradeCard 
                icon={<Dna size={18} />} 
                title="Suspensão" 
                price={PRICES.upgrades.suspensao} 
                value={upgrades.suspensao} 
                onChange={(v) => updateUpgrade('suspensao', v)} 
              />

              {/* Blindagem */}
              <UpgradeCard 
                icon={<Shield size={18} />} 
                title="Blindagem" 
                price={PRICES.upgrades.blindagem} 
                value={upgrades.blindagem} 
                onChange={(v) => updateUpgrade('blindagem', v)} 
              />
            </div>
          </section>

          {/* Sections: Itens & Avulsos */}
          <div className={`grid grid-cols-1 md:grid-cols-2 gap-8 ${activeTab !== 'items' ? 'hidden lg:grid' : ''}`}>
            {/* Section: Venda de Itens */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-red-500">
                <Package size={20} />
                <h2 className="text-lg font-bold uppercase tracking-tight">Venda de Itens</h2>
              </div>
              
              <div className="space-y-3">
                <ItemCounter 
                  title="Kit Reparo Básico" 
                  price={PRICES.items.reparoBasico} 
                  count={items.reparoBasico} 
                  limit={LIMITS.reparoBasico}
                  onAdd={() => updateItemCount('reparoBasico', 1)}
                  onSub={() => updateItemCount('reparoBasico', -1)}
                />
                <ItemCounter 
                  title="Kit Reparo Avançado" 
                  price={PRICES.items.reparoAvancado} 
                  count={items.reparoAvancado} 
                  limit={LIMITS.reparoAvancado}
                  onAdd={() => updateItemCount('reparoAvancado', 1)}
                  onSub={() => updateItemCount('reparoAvancado', -1)}
                />
                <ItemCounter 
                  title="Pneu" 
                  price={PRICES.items.pneu} 
                  count={items.pneu} 
                  limit={LIMITS.pneu}
                  onAdd={() => updateItemCount('pneu', 1)}
                  onSub={() => updateItemCount('pneu', -1)}
                />
              </div>
            </section>

            {/* Section: Itens Avulsos */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-red-500">
                <Wrench size={20} />
                <h2 className="text-lg font-bold uppercase tracking-tight">Itens Avulsos</h2>
              </div>
              
              <div className="space-y-3">
                <ItemCounter 
                  title="Chave Inglesa" 
                  price={PRICES.avulsos.chaveInglesa} 
                  count={avulsos.chaveInglesa} 
                  limit={LIMITS.avulsos}
                  hideLimit
                  onAdd={() => updateAvulsoCount('chaveInglesa', 1)}
                  onSub={() => updateAvulsoCount('chaveInglesa', -1)}
                />
                <ItemCounter 
                  title="Elevador Hidráulico" 
                  price={PRICES.avulsos.elevador} 
                  count={avulsos.elevador} 
                  limit={LIMITS.avulsos}
                  hideLimit
                  onAdd={() => updateAvulsoCount('elevador', 1)}
                  onSub={() => updateAvulsoCount('elevador', -1)}
                />
                <ItemCounter 
                  title="Rastreador" 
                  price={PRICES.avulsos.rastreador} 
                  count={avulsos.rastreador} 
                  limit={LIMITS.avulsos}
                  hideLimit
                  onAdd={() => updateAvulsoCount('rastreador', 1)}
                  onSub={() => updateAvulsoCount('rastreador', -1)}
                />
                <ItemCounter 
                  title="Exaustor (Pops & Bangs)" 
                  price={PRICES.avulsos.exaustor} 
                  count={avulsos.exaustor} 
                  limit={LIMITS.avulsos}
                  hideLimit
                  onAdd={() => updateAvulsoCount('exaustor', 1)}
                  onSub={() => updateAvulsoCount('exaustor', -1)}
                />
              </div>
            </section>
          </div>

          {/* Section: Atendimento Externo */}
          <section className={`space-y-4 ${activeTab !== 'services' ? 'hidden lg:block' : ''}`}>
            <div className="flex items-center gap-2 text-red-500">
              <Truck size={20} />
              <h2 className="text-lg font-bold uppercase tracking-tight">Atendimento Externo</h2>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-zinc-400 mb-2">
                  <MapPin size={16} />
                  <span className="text-xs font-bold uppercase tracking-widest">Distância do Chamado</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <input 
                      type="number" 
                      min="0"
                      placeholder="0"
                      className="bg-zinc-800/50 border border-zinc-700 text-white rounded-xl px-4 py-3 w-full focus:ring-2 focus:ring-red-600 focus:outline-none transition-all font-bold text-lg [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      value={servicos.distancia || ''}
                      onChange={(e) => setServicos(prev => ({ ...prev, distancia: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <button 
                      onClick={() => setServicos(prev => ({ ...prev, distancia: (prev.distancia || 0) + 1 }))}
                      className="p-1.5 bg-zinc-800 hover:bg-red-600 text-zinc-400 hover:text-white rounded-lg border border-zinc-700 transition-all active:scale-90"
                    >
                      <ChevronUp size={18} />
                    </button>
                    <button 
                      onClick={() => setServicos(prev => ({ ...prev, distancia: Math.max(0, (prev.distancia || 0) - 1) }))}
                      className="p-1.5 bg-zinc-800 hover:bg-red-600 text-zinc-400 hover:text-white rounded-lg border border-zinc-700 transition-all active:scale-90"
                    >
                      <ChevronDown size={18} />
                    </button>
                  </div>
                  <div className="text-right min-w-[80px]">
                    <p className="text-[10px] text-zinc-500 font-bold uppercase">Custo KM</p>
                    <p className="text-red-500 font-bold">{formatCurrency(servicos.distancia * PRICES.servicos.km)}</p>
                  </div>
                </div>
                <p className="text-[10px] text-zinc-600 italic">* Cobrado $500 por cada 1 KM de distância.</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 text-zinc-400 mb-2">
                  <Info size={16} />
                  <span className="text-xs font-bold uppercase tracking-widest">Serviços Adicionais</span>
                </div>
                <div className="space-y-3">
                  <CheckboxField 
                    label="Reparo Externo" 
                    price={PRICES.servicos.reparoExterno} 
                    checked={servicos.reparoExterno} 
                    onChange={(v) => setServicos(prev => ({ ...prev, reparoExterno: v }))} 
                  />
                  <CheckboxField 
                    label="Troca Pneu / Venda Ext." 
                    price={PRICES.servicos.trocaPneuExterna} 
                    checked={servicos.trocaPneuExterna} 
                    onChange={(v) => setServicos(prev => ({ ...prev, trocaPneuExterna: v }))} 
                  />
                </div>
              </div>
            </div>
          </section>
        </motion.div>
      </AnimatePresence>

        {/* Right Column: Summary (Desktop) */}
        <aside className={`lg:col-span-4 ${(activeTab === 'summary' || activeTab === 'mechanic') ? 'block' : 'hidden lg:block'}`}>
          <AnimatePresence mode="wait">
            <motion.div 
              key={activeTab}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="sticky top-28 space-y-6"
            >
            {/* Summary Section - Hidden on mobile if tab is 'mechanic' */}
            <div id="tutorial-summary" className={`bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl shadow-black/50 ${activeTab === 'mechanic' ? 'hidden lg:block' : 'block'}`}>
              <div className="bg-red-600 p-6">
                <h2 className="text-white font-black uppercase tracking-tighter text-2xl italic">Resumo da Fatura</h2>
              </div>
              
              <div className="p-6 space-y-6">
                <div className="space-y-4">
                  <SummaryRow label="Subtotal Upgrades" value={totals.upgrades} />
                  <SummaryRow label="Subtotal Itens" value={totals.items} />
                  <SummaryRow label="Subtotal Serviços" value={totals.servicos} />
                </div>
                
                <div className="pt-6 border-t border-zinc-800">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1">Total Final</p>
                      <p className="text-4xl font-black text-white tracking-tighter">{formatCurrency(totals.total)}</p>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={resetAll}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-red-900/20 active:scale-95 flex items-center justify-center gap-2"
                >
                  <Trash2 size={20} />
                  Limpar Tudo
                </button>
              </div>
            </div>

            {/* Info Message repositioned between summary and mechanic - Hidden on mobile if tab is 'mechanic' */}
            <div className={`bg-zinc-900/50 border border-zinc-800 p-4 rounded-2xl flex items-start gap-3 ${activeTab === 'mechanic' ? 'hidden lg:block' : 'flex'}`}>
              <Info className="text-zinc-500 shrink-0" size={18} />
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Os valores apresentados são baseados na tabela oficial da Summer Garage. 
                Certifique-se de conferir todos os itens antes de finalizar o pagamento com o cliente.
              </p>
            </div>

            {/* Mechanic Profile Box - Hidden on mobile if tab is 'summary' */}
            <AnimatePresence>
              {user && (
                <motion.div 
                  id="tutorial-mechanic"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`bg-zinc-900/40 backdrop-blur-md border border-zinc-800 p-6 rounded-3xl relative overflow-hidden group ${activeTab === 'summary' ? 'hidden lg:block' : 'block'}`}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                  
                  <div className="relative z-10 flex items-center gap-4">
                    <div className="relative">
                      <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-red-600 shadow-lg shadow-red-900/20">
                        <img 
                          src={user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : `https://cdn.discordapp.com/embed/avatars/0.png`} 
                          alt={user.username}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="absolute -bottom-1 -right-1 bg-green-500 w-4 h-4 rounded-full border-2 border-zinc-900" />
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        {user.roles && user.roles.filter(r => !/^\d+$/.test(r)).length > 0 ? (
                          user.roles.filter(r => !/^\d+$/.test(r)).map((roleName: string) => (
                            <span key={roleName} className="text-[10px] font-black text-red-500 uppercase tracking-[0.2em]">
                              {roleName}
                            </span>
                          ))
                        ) : (
                          <span className="text-[10px] font-black text-red-500 uppercase tracking-[0.2em]">
                            MECÂNICO AUTORIZADO
                          </span>
                        )}
                      </div>
                      <h3 className="text-xl font-black text-white uppercase tracking-tighter italic">{user.displayName || user.username}</h3>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className="bg-zinc-800 text-zinc-400 text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-widest">ID: {user.id.slice(-6)}</span>
                        <button 
                          onClick={() => {
                            localStorage.removeItem('summer_garage_tutorial_seen');
                            setTutorialStep(0);
                            setShowTutorial(true);
                            addToast('Iniciando guia da oficina...', 'info');
                          }}
                          className="text-[9px] text-zinc-600 hover:text-red-500 font-bold uppercase tracking-widest flex items-center gap-1.5 transition-colors"
                        >
                          <Info size={10} />
                          Tutorial
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Goals Section */}
                  <div className="mt-6 space-y-4">
                    <div className="bg-zinc-950/50 rounded-2xl p-4 border border-zinc-800/50">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="p-1.5 bg-green-500/10 rounded-lg">
                          <Zap size={14} className="text-green-500" />
                        </div>
                        <h4 className="text-[11px] font-black text-white uppercase tracking-widest italic">Meta Financeira Semanal</h4>
                      </div>
                      <div className="flex items-end justify-between">
                        <div>
                          <p className="text-2xl font-black text-white tracking-tighter">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(goals.money)}
                          </p>
                          <p className="text-[9px] text-zinc-500 uppercase font-bold">Prazo: Todo Domingo</p>
                        </div>
                        <div className="text-right">
                          <button 
                            id="tutorial-finance-status"
                            onClick={toggleFinanceStatus}
                            className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-tighter transition-colors ${
                              mechanicState.financeStatus === 'PAGA' ? 'bg-green-500/20 text-green-500' :
                              mechanicState.financeStatus === 'EM DIA' ? 'bg-blue-500/20 text-blue-500' :
                              'bg-red-500/20 text-red-500'
                            }`}
                          >
                            {mechanicState.financeStatus}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div id="tutorial-daily-farm" className="relative bg-zinc-950/50 rounded-2xl p-4 border border-zinc-800/50">
                        <div className="flex items-center gap-2 mb-2">
                          <Package size={14} className="text-red-500" />
                          <h4 className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Daily Farm</h4>
                        </div>
                        <p className="text-lg font-black text-white tracking-tighter">{mechanicState.dailyFarm} <span className="text-[10px] text-zinc-500 uppercase">/ {goals.dailyItems}</span></p>
                        <button 
                          onClick={resetDailyFarm}
                          className="absolute bottom-3 right-3 p-1.5 text-zinc-700 hover:text-red-500 transition-colors bg-black/20 rounded-lg"
                          title="Resetar Dia"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <div id="tutorial-weekly-farm" className="relative bg-zinc-950/50 rounded-2xl p-4 border border-zinc-800/50">
                        <div className="flex items-center gap-2 mb-2">
                          <Shield size={14} className="text-red-500" />
                          <h4 className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Weekly Farm</h4>
                        </div>
                        <p className="text-lg font-black text-white tracking-tighter">{mechanicState.weeklyFarm} <span className="text-[10px] text-zinc-500 uppercase">/ {goals.weeklyItems}</span></p>
                        <button 
                          onClick={resetWeeklyFarm}
                          className="absolute bottom-3 right-3 p-1.5 text-zinc-700 hover:text-red-500 transition-colors bg-black/20 rounded-lg"
                          title="Resetar Semana"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>

                    {/* Manual Farm Entry */}
                    <div id="tutorial-manual-farm" className="bg-red-600/5 border border-red-600/20 rounded-xl p-3">
                      <p className="text-[9px] font-black text-red-500 uppercase mb-2 tracking-widest">Lançar Farm Manual</p>
                      <div className="flex gap-2">
                        <input 
                          type="number" 
                          value={farmInput}
                          onChange={(e) => setFarmInput(e.target.value)}
                          placeholder="Qtd..."
                          className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-red-500/50"
                        />
                        <button 
                          onClick={handleAddFarm}
                          className="bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded-lg text-[10px] font-black transition-colors"
                        >
                          OK
                        </button>
                      </div>
                    </div>

                    {/* Items List */}
                    <div id="tutorial-items-list" className="space-y-2">
                      <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Itens Necessários</p>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { name: 'Sucata', icon: '📦' },
                          { name: 'Peças Metal', icon: '⚙️' },
                          { name: 'Fios Cobre', icon: '🔌' },
                          { name: 'Plástico', icon: '🧪' },
                          { name: 'Bateria', icon: '🔋' },
                          { name: 'Alumínio', icon: '💿' }
                        ].map((item) => (
                          <div key={item.name} className="flex items-center gap-2 p-2 bg-white/[0.02] border border-white/5 rounded-lg">
                            <span className="text-xs">{item.icon}</span>
                            <span className="text-[9px] font-bold text-zinc-400 uppercase">{item.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-red-600/5 border border-red-600/20 rounded-xl p-3">
                      <p className="text-[9px] text-red-500/80 font-bold uppercase tracking-wider leading-tight">
                        ⚠️ O valor pode ser reajustado conforme a necessidade da mecânica.
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-zinc-800/50 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-zinc-500">
                      <CheckCircle2 size={14} className="text-green-500" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">Sessão Ativa</span>
                    </div>
                    <button 
                      onClick={handleLogout}
                      className="text-[10px] font-black text-zinc-500 hover:text-red-500 uppercase tracking-widest transition-colors flex items-center gap-1"
                    >
                      <LogOut size={12} />
                      Sair
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </AnimatePresence>
      </aside>
      </main>

      {/* Footer Credit */}
      <footer className="max-w-7xl mx-auto px-4 py-8 text-center relative z-10 flex flex-col items-center gap-4">
        <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest">
          Made with ❤️ by Alek
        </p>
      </footer>

      {/* Mobile Fixed Footer */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-zinc-950/80 backdrop-blur-xl border-t border-zinc-800/50 px-2 pt-3 pb-8 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
        <div className="max-w-md mx-auto flex items-center justify-between relative">
          {[
            { id: 'upgrades', icon: Zap, label: 'Tuning' },
            { id: 'items', icon: Disc, label: 'Itens' },
            { id: 'services', icon: Truck, label: 'Serviços' },
            { id: 'summary', icon: Settings2, label: 'Fatura' },
            { id: 'mechanic', icon: User, label: 'Perfil' },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`relative flex flex-col items-center gap-1.5 px-3 py-1 transition-all duration-300 ${isActive ? 'text-red-500 scale-110' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                <span className={`text-[8px] font-black uppercase tracking-tighter transition-opacity ${isActive ? 'opacity-100' : 'opacity-60'}`}>
                  {tab.label}
                </span>
                {isActive && (
                  <motion.div 
                    layoutId="activeTab"
                    className="absolute -top-3 left-1/2 -translate-x-1/2 w-1 h-1 bg-red-500 rounded-full shadow-[0_0_8px_#ef4444]"
                  />
                )}
              </button>
            );
          })}
          
          <div className="w-px h-6 bg-zinc-800/50 mx-1" />
          
          <button 
            onClick={resetAll}
            className="bg-red-600/10 hover:bg-red-600/20 text-red-500 p-2.5 rounded-xl transition-all active:scale-90 border border-red-500/20"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      {/* Toast Notifications */}
      <div className="fixed top-24 right-4 z-[400] flex flex-col gap-3 pointer-events-none">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.95 }}
              className={`
                pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl border min-w-[280px]
                ${toast.type === 'success' ? 'bg-zinc-900 border-green-900/50 text-green-400' : ''}
                ${toast.type === 'warning' ? 'bg-zinc-900 border-red-900/50 text-red-400' : ''}
                ${toast.type === 'info' ? 'bg-zinc-900 border-zinc-800 text-zinc-300' : ''}
              `}
            >
              {toast.type === 'success' && <CheckCircle2 size={18} />}
              {toast.type === 'warning' && <AlertTriangle size={18} />}
              {toast.type === 'info' && <Info size={18} />}
              <p className="text-sm font-bold tracking-tight">{toast.message}</p>
              <button 
                onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                className="ml-auto p-1 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Tutorial Overlay */}
      <AnimatePresence>
        {showTutorial && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[250] pointer-events-none"
          >
            {/* Spotlight Effect */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              <defs>
                <mask id="spotlight-mask">
                  <rect x="0" y="0" width="100%" height="100%" fill="white" />
                  <motion.rect 
                    animate={{
                      x: (tutorialPosition.width || 0) > 0 ? (tutorialPosition.left || 0) - 12 : window.innerWidth / 2 - 50,
                      y: (tutorialPosition.width || 0) > 0 ? (tutorialPosition.top || 0) - 12 : window.innerHeight / 2 - 50,
                      width: (tutorialPosition.width || 0) > 0 ? (tutorialPosition.width || 0) + 24 : 100,
                      height: (tutorialPosition.width || 0) > 0 ? (tutorialPosition.height || 0) + 24 : 100,
                    }}
                    transition={{ type: "spring", damping: 50, stiffness: 80 }}
                    rx="20" 
                    fill="black" 
                  />
                </mask>
              </defs>
              <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.85)" mask="url(#spotlight-mask)" />
            </svg>

            {/* Glowing Highlight */}
            <motion.div 
              animate={{
                top: (tutorialPosition.width || 0) > 0 ? (tutorialPosition.top || 0) - 12 : window.innerHeight / 2 - 50,
                left: (tutorialPosition.width || 0) > 0 ? (tutorialPosition.left || 0) - 12 : window.innerWidth / 2 - 50,
                width: (tutorialPosition.width || 0) > 0 ? (tutorialPosition.width || 0) + 24 : 100,
                height: (tutorialPosition.width || 0) > 0 ? (tutorialPosition.height || 0) + 24 : 100,
                opacity: (tutorialPosition.width || 0) > 0 ? 1 : 0.5,
                scale: [1, 1.02, 1]
              }}
              transition={{ 
                top: { type: "spring", damping: 50, stiffness: 80 },
                left: { type: "spring", damping: 50, stiffness: 80 },
                width: { type: "spring", damping: 50, stiffness: 80 },
                height: { type: "spring", damping: 50, stiffness: 80 },
                scale: { duration: 3, repeat: Infinity, ease: "easeInOut" }
              }}
              className="absolute border-2 border-red-600 rounded-3xl shadow-[0_0_50px_rgba(220,38,38,0.6)] pointer-events-none z-[255]"
            />

            {/* Tutorial Box */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ 
                opacity: 1, 
                scale: 1,
                // Position tutorial box dynamically and keep it inside window
                top: tutorialPosition.width > 0 
                  ? (tutorialPosition.height > window.innerHeight * 0.8
                      ? window.innerHeight / 2 - 150 // If element is too big, center box
                      : (tutorialPosition.width > window.innerWidth * 0.6
                          ? (tutorialPosition.top < 100 // If it's at the top (like header)
                              ? tutorialPosition.top + tutorialPosition.height + 60
                              : (tutorialPosition.top + tutorialPosition.height + 80 > window.innerHeight - 320
                                  ? Math.max(20, tutorialPosition.top - 360)
                                  : Math.max(20, tutorialPosition.top + tutorialPosition.height + 60)))
                          : Math.max(20, Math.min(window.innerHeight - 340, tutorialPosition.top + (tutorialPosition.height / 2) - 160))))
                  : window.innerHeight / 2 - 150,
                left: tutorialPosition.width > 0
                  ? (tutorialPosition.width > window.innerWidth * 0.6
                      ? Math.max(20, Math.min(window.innerWidth - 340, (window.innerWidth / 2) - 160)) // Center horizontally for wide elements
                      : (tutorialPosition.left + (tutorialPosition.width / 2) > window.innerWidth / 2
                          ? Math.max(20, tutorialPosition.left - 340) // Place to the left of the element
                          : Math.max(20, Math.min(window.innerWidth - 340, tutorialPosition.left + tutorialPosition.width + 20)))) // Place to the right
                  : window.innerWidth / 2 - 160
              }}
              whileHover={{ y: -5 }}
              transition={{ 
                top: { type: "spring", damping: 50, stiffness: 80 },
                left: { type: "spring", damping: 50, stiffness: 80 },
                scale: { type: "spring", damping: 25, stiffness: 150 },
                y: { duration: 3, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }
              }}
              className="fixed z-[260] w-[320px] bg-zinc-900 border border-zinc-800 p-8 rounded-[2.5rem] shadow-2xl pointer-events-auto"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-zinc-800">
                <motion.div 
                  className="h-full bg-red-600"
                  initial={{ width: "0%" }}
                  animate={{ width: `${((tutorialStep + 1) / tutorialSteps.length) * 100}%` }}
                />
              </div>

              <div className="flex items-center justify-between mb-4">
                <div className="p-2 bg-red-600/10 rounded-xl">
                  <Wrench className="text-red-600" size={18} />
                </div>
                <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">
                  {tutorialStep + 1} / {tutorialSteps.length}
                </span>
              </div>

              <h2 className="text-lg font-black text-white uppercase italic tracking-tighter mb-2">
                {tutorialSteps[tutorialStep].title}
              </h2>
              <p className="text-zinc-400 text-xs leading-relaxed mb-6">
                {tutorialSteps[tutorialStep].content}
              </p>

              <div className="flex gap-2">
                {tutorialStep > 0 && (
                  <button 
                    onClick={() => setTutorialStep(prev => prev - 1)}
                    className="flex-1 px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400 font-bold text-[10px] hover:bg-zinc-800 transition-colors"
                  >
                    VOLTAR
                  </button>
                )}
                <button 
                  onClick={() => {
                    if (tutorialStep < tutorialSteps.length - 1) {
                      setTutorialStep(prev => prev + 1);
                    } else {
                      closeTutorial();
                    }
                  }}
                  className="flex-[2] bg-red-600 hover:bg-red-500 text-white font-black py-2 rounded-xl text-[10px] transition-all active:scale-95"
                >
                  {tutorialStep === tutorialSteps.length - 1 ? "ENTENDIDO!" : "PRÓXIMO"}
                </button>
              </div>

              <button 
                onClick={closeTutorial}
                className="absolute top-4 right-4 text-zinc-600 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Sub-components ---

function UpgradeCard({ icon, title, price, value, onChange }: { 
  icon: ReactNode, 
  title: string, 
  price: number, 
  value: number, 
  onChange: (v: number) => void 
}) {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { 
      style: 'currency', 
      currency: 'USD',
      currencyDisplay: 'narrowSymbol' 
    }).format(val).replace('US$', '$');
  };
  
  return (
    <div className="bg-zinc-900/40 backdrop-blur-md border border-zinc-800 p-5 rounded-2xl space-y-4 hover:border-red-900/50 transition-all h-full flex flex-col justify-between relative overflow-hidden group">
      {/* Refraction effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      
      <div className="flex items-center justify-between relative z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-zinc-800 rounded-lg text-red-500">
            {icon}
          </div>
          <div>
            <h3 className="font-bold text-zinc-200">{title}</h3>
            <p className="text-xs text-zinc-500">{formatCurrency(price)} / nível</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold text-red-500">{formatCurrency(value * price)}</p>
        </div>
      </div>
      
      <div className="space-y-3">
        <div className="flex justify-between text-[10px] font-black text-zinc-600 uppercase tracking-widest">
          <span>Nível {value}</span>
          <span>Máx Nível 4</span>
        </div>
        <input 
          type="range" min="0" max="4" step="1" 
          className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
        />
      </div>
    </div>
  );
}

function ItemCounter({ title, price, count, limit, onAdd, onSub, hideLimit }: {
  title: string,
  price: number,
  count: number,
  limit: number,
  onAdd: () => void,
  onSub: () => void,
  hideLimit?: boolean
}) {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { 
      style: 'currency', 
      currency: 'USD',
      currencyDisplay: 'narrowSymbol' 
    }).format(val).replace('US$', '$');
  };

  return (
    <div className="bg-zinc-900/40 backdrop-blur-md border border-zinc-800 p-4 rounded-2xl flex items-center justify-between hover:border-red-900/50 transition-all relative overflow-hidden group">
      {/* Refraction effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      
      <div className="relative z-10">
        <h3 className="font-bold text-zinc-200 text-sm">{title}</h3>
        <p className="text-[10px] text-zinc-500 font-medium">
          {formatCurrency(price)} un. {!hideLimit && `(Máx ${limit})`}
        </p>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right mr-2">
          <AnimatePresence mode="wait">
            <motion.p 
              key={count * price}
              initial={{ y: -5, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 5, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="text-xs font-bold text-red-500"
            >
              {formatCurrency(count * price)}
            </motion.p>
          </AnimatePresence>
        </div>
        <div className="flex items-center bg-zinc-800 rounded-xl p-1 border border-zinc-700">
          <button 
            onClick={onSub}
            disabled={count <= 0}
            className="p-2 hover:bg-zinc-700 rounded-lg text-zinc-400 disabled:opacity-30 transition-colors"
          >
            <Minus size={14} />
          </button>
          <div className="w-8 overflow-hidden">
            <AnimatePresence mode="popLayout">
              <motion.span 
                key={count}
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -10, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="text-center font-bold text-white block"
              >
                {count}
              </motion.span>
            </AnimatePresence>
          </div>
          <button 
            onClick={onAdd}
            disabled={count >= limit}
            className="p-2 hover:bg-zinc-700 rounded-lg text-red-500 disabled:opacity-30 transition-colors"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function CheckboxField({ label, price, checked, onChange }: {
  label: string,
  price: number,
  checked: boolean,
  onChange: (v: boolean) => void
}) {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { 
      style: 'currency', 
      currency: 'USD',
      currencyDisplay: 'narrowSymbol' 
    }).format(val).replace('US$', '$');
  };

  return (
    <label className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-xl border border-transparent hover:border-zinc-700 transition-all cursor-pointer group">
      <div className="flex items-center gap-3">
        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${checked ? 'bg-red-600 border-red-600' : 'border-zinc-600 group-hover:border-zinc-500'}`}>
          {checked && <Plus size={12} className="text-white" strokeWidth={4} />}
        </div>
        <span className={`text-sm font-medium transition-colors ${checked ? 'text-white' : 'text-zinc-400'}`}>{label}</span>
      </div>
      <span className={`text-xs font-bold ${checked ? 'text-red-500' : 'text-zinc-600'}`}>{formatCurrency(price)}</span>
      <input 
        type="checkbox" 
        className="hidden" 
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

function SummaryRow({ label, value }: { label: string, value: number }) {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { 
      style: 'currency', 
      currency: 'USD',
      currencyDisplay: 'narrowSymbol' 
    }).format(val).replace('US$', '$');
  };
  return (
    <div className="flex justify-between items-center">
      <span className="text-zinc-500 text-sm font-medium">{label}</span>
      <span className="text-zinc-200 font-bold">{formatCurrency(value)}</span>
    </div>
  );
}
