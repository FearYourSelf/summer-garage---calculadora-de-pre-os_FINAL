import axios from 'axios';
import * as React from 'react';
import { useState, useMemo, ReactNode, useEffect, useRef, createContext, useContext, ErrorInfo } from 'react';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp, getDocFromServer } from 'firebase/firestore';
import { signInWithCustomToken } from 'firebase/auth';
import { db, auth } from './firebase';
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
  ChevronLeft,
  Lock,
  Info,
  Target,
  CheckCircle2,
  AlertTriangle,
  X,
  ChevronUp,
  ChevronDown,
  LogOut,
  User,
  Calendar,
  Fan,
  Dna,
  Joystick,
  Copy,
  HelpCircle,
  Users,
  Eye,
  ArrowLeft,
  History,
  TrendingUp
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
  reparoBasico: 4,
  reparoAvancado: 4,
  pneu: 4,
  avulsos: 10, // Default limit for avulsos
};

interface TooltipContextType {
  showTooltip: (text: string) => void;
  hideTooltip: () => void;
}

const TooltipContext = createContext<TooltipContextType | undefined>(undefined);

export const useTooltip = () => {
  const context = useContext(TooltipContext);
  if (!context) throw new Error('useTooltip must be used within a TooltipProvider');
  return context;
};

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    providerInfo: any[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  // We don't necessarily want to crash the whole app for a background sync error,
  // but we should log it clearly.
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    const { hasError, error } = this.state;
    if (hasError) {
      return (
        <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
          <AlertTriangle size={48} className="text-red-500 mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Ops! Algo deu errado.</h1>
          <p className="text-zinc-400 mb-6 max-w-md">
            Ocorreu um erro inesperado no aplicativo. Tente recarregar a página.
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors"
          >
            Recarregar Página
          </button>
          {process.env.NODE_ENV === 'development' && (
            <pre className="mt-8 p-4 bg-zinc-900 text-red-400 text-xs text-left overflow-auto max-w-full rounded-lg border border-red-900/30">
              {error?.toString()}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  // --- Helpers ---
  const getSPDate = () => {
    return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  };

  const getDefaultMechanicState = () => {
    const defaultItemFarms = {
      'Caixa de ferramentas': { daily: 0, weekly: 0, monthly: 0 },
      'Ferramentas': { daily: 0, weekly: 0, monthly: 0 },
      'Metal': { daily: 0, weekly: 0, monthly: 0 },
      'Aro de Roda': { daily: 0, weekly: 0, monthly: 0 },
      'Roda': { daily: 0, weekly: 0, monthly: 0 },
      'Aluminio': { daily: 0, weekly: 0, monthly: 0 }
    };

    return {
      mechanicName: '',
      dailyFarm: 0,
      weeklyFarm: 0,
      monthlyFarm: 0,
      itemFarms: defaultItemFarms,
      financeStatus: 'PENDENTE' as 'PENDENTE' | 'EM DIA' | 'PAGA',
      salesLog: {
        upgrades: 0,
        items: 0,
        avulsos: 0,
        services: 0,
        totalValue: 0,
        count: 0,
        history: {} as Record<string, { upgrades: number, items: number, avulsos: number, services: number, totalValue: number, count: number }>
      },
      lastUpdate: getSPDate().toISOString(),
      lastDailyReset: getSPDate().toISOString(),
      lastWeeklyReset: getSPDate().toISOString()
    };
  };

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
  const [activeTab, setActiveTab] = useState<'upgrades' | 'items' | 'services' | 'summary' | 'mechanic' | 'staff'>('upgrades');
  const [toasts, setToasts] = useState<{ id: number, message: string, type: 'success' | 'warning' | 'info' }[]>([]);
  const [user, setUser] = useState<{ id: string, username: string, avatar: string | null, displayName?: string, roles?: { name: string, color: string }[], roleColor?: string } | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isFirebaseReady, setIsFirebaseReady] = useState(false);
  const [showAnonymousWarning, setShowAnonymousWarning] = useState(false);
  const MASTER_ID = '1357838586501664849';
  const isMaster = user?.id === MASTER_ID;
  const [goals, setGoals] = useState({ money: 15000, dailyItems: 100, weeklyItems: 600, monthlyItems: 2400 });
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [tempGoals, setTempGoals] = useState({ money: 15000, dailyItems: 100, weeklyItems: 600, monthlyItems: 2400 });
  const [globalState, setGlobalState] = useState({ 
    maintenance: false, 
    broadcast: '',
    staff: {} as Record<string, 'admin' | 'manager'>
  });

  const isStaff = useMemo(() => {
    if (!user || !globalState.staff) return false;
    if (user.id === MASTER_ID) return true;
    return !!globalState.staff[user.id];
  }, [user, globalState.staff]);

  const isAdmin = useMemo(() => {
    if (!user || !globalState.staff) return false;
    if (user.id === MASTER_ID) return true;
    return globalState.staff[user.id] === 'admin';
  }, [user, globalState.staff]);

  const [mechanicsList, setMechanicsList] = useState<any[]>([]);
  const [viewingMechanicId, setViewingMechanicId] = useState<string | null>(null);
  const lastMechanicDataRef = useRef<any>(null);

  const [is24Hour, setIs24Hour] = useState(() => {
    const saved = localStorage.getItem('summer_garage_clock_format');
    return saved ? saved === '24h' : true;
  });

  // Persistent Mechanic State
  const [mechanicState, setMechanicState] = useState(() => {
    const saved = localStorage.getItem('summer_garage_mechanic_state');
    const defaultState = getDefaultMechanicState();

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        
        if (!parsed.salesLog) parsed.salesLog = defaultState.salesLog;
        if (!parsed.salesLog.history) parsed.salesLog.history = {};
        if (parsed.mechanicName === undefined) parsed.mechanicName = '';
        if (!parsed.itemFarms) parsed.itemFarms = defaultState.itemFarms;

        const now = getSPDate();
        const lastDaily = new Date(parsed.lastDailyReset || parsed.lastUpdate);
        const lastWeekly = new Date(parsed.lastWeeklyReset || parsed.lastUpdate);

        const getWeekNumber = (d: Date) => {
          const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
          date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
          const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
          return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
        };

        // Check Daily Reset
        if (now.getDate() !== lastDaily.getDate() || now.getMonth() !== lastDaily.getMonth() || now.getFullYear() !== lastDaily.getFullYear()) {
          parsed.dailyFarm = 0;
          Object.keys(parsed.itemFarms).forEach(k => {
            parsed.itemFarms[k].daily = 0;
          });
          parsed.lastDailyReset = now.toISOString();
        }

        // Check Weekly Reset
        if (getWeekNumber(now) !== getWeekNumber(lastWeekly)) {
          parsed.weeklyFarm = 0;
          Object.keys(parsed.itemFarms).forEach(k => {
            parsed.itemFarms[k].weekly = 0;
          });
          parsed.lastWeeklyReset = now.toISOString();
        }

        return parsed;
      } catch (e) {
        return defaultState;
      }
    }
    return defaultState;
  });

  // --- Firebase Sync ---
  useEffect(() => {
    // Test connection
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'settings', 'connection_test'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. The client is offline.");
        }
      }
    };
    testConnection();
  }, []);

  useEffect(() => {
    if (user && user.id !== 'anonymous' && isFirebaseReady) {
      const docPath = `mechanics/${user.id}`;
      const docRef = doc(db, 'mechanics', user.id);
      
      const unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          lastMechanicDataRef.current = data;
          setMechanicState(data as any);
        } else {
          // Initialize doc if it doesn't exist
          const initialState = getDefaultMechanicState();
          initialState.mechanicName = user.displayName || user.username;
          setDoc(docRef, initialState).catch(err => handleFirestoreError(err, OperationType.WRITE, docPath));
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, docPath);
      });

      return () => unsubscribe();
    }
  }, [user?.id, isFirebaseReady]);

  useEffect(() => {
    if (user && user.id !== 'anonymous' && mechanicState.mechanicName && isFirebaseReady) {
      // Compare with last data from server to avoid loop
      const { lastUpdate: currentLU, ...restCurrent } = mechanicState;
      const { lastUpdate: lastLU, ...restLast } = lastMechanicDataRef.current || {};
      
      if (JSON.stringify(restCurrent) === JSON.stringify(restLast)) return;

      const docPath = `mechanics/${user.id}`;
      const docRef = doc(db, 'mechanics', user.id);
      const timer = setTimeout(() => {
        setDoc(docRef, {
          ...mechanicState,
          lastUpdate: new Date().toISOString()
        }, { merge: true }).catch(err => handleFirestoreError(err, OperationType.UPDATE, docPath));
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [mechanicState, user?.id]);

  useEffect(() => {
    const docPath = 'settings/global';
    const docRef = doc(db, 'settings', 'global');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setGlobalState({
          maintenance: data.maintenance || false,
          broadcast: data.broadcast || '',
          staff: data.staff || {}
        });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, docPath);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isStaff) {
      const fetchMechanics = async () => {
        try {
          const res = await fetch('/api/mechanics');
          if (res.ok) {
            const data = await res.json();
            setMechanicsList(data);
          }
        } catch (e) {
          console.error('Error fetching mechanics list');
        }
      };
      fetchMechanics();
      const interval = setInterval(fetchMechanics, 60000);
      return () => clearInterval(interval);
    }
  }, [isStaff]);

  const activeMechanicData = useMemo(() => {
    if (viewingMechanicId && mechanicsList.length > 0) {
      return mechanicsList.find(m => m.id === viewingMechanicId) || mechanicState;
    }
    return mechanicState;
  }, [viewingMechanicId, mechanicsList, mechanicState]);

  // Tutorial State
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [tutorialPosition, setTutorialPosition] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    if (user && !isAnonymous) {
      if (isMaster) {
        addToast('SISTEMA: Acesso Master Concedido.\nBem-vindo, Desenvolvedor.', 'info');
      } else {
        addToast(`Bem-vindo de volta!\nOficina Summer Garage: ${user.displayName || user.username}`, 'info');
      }
    }
  }, [user?.id, isMaster, isAnonymous]);

  // Error Reporting
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (isMaster || isAnonymous) return; // Don't report developer's own errors or anonymous users
      fetch('/api/debug/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: event.message,
          stack: event.error?.stack,
          user: user?.username || 'Anonymous',
          id: user?.id || 'N/A',
          url: window.location.href,
          platform: navigator.platform
        })
      }).catch(() => {});
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, [user, isMaster]);

  const toggleClockFormat = () => {
    setIs24Hour(prev => {
      const next = !prev;
      localStorage.setItem('summer_garage_clock_format', next ? '24h' : '12h');
      // Use warning type for red color as requested
      addToast(`Formato alterado para ${next ? '24h' : '12h'}`, 'warning');
      return next;
    });
  };

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

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
      
      // Switch tab if needed
      if (step.tab && activeTab !== step.tab) {
        setActiveTab(step.tab as any);
      }

      // Scroll to element
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
          
          // Safety check for finite numbers
          const safeRect = {
            top: Number.isFinite(rect.top) ? rect.top : 0,
            left: Number.isFinite(rect.left) ? rect.left : 0,
            width: Number.isFinite(rect.width) ? rect.width : 0,
            height: Number.isFinite(rect.height) ? rect.height : 0
          };

          // If element is not visible (width/height 0), try to find a visible parent or fallback
          if (safeRect.width === 0 || safeRect.height === 0) {
            const main = document.querySelector('main');
            if (main) {
              const mainRect = main.getBoundingClientRect();
              setTutorialPosition({
                top: (Number.isFinite(mainRect.top) ? mainRect.top : 0) + 100,
                left: (Number.isFinite(mainRect.left) ? mainRect.left : 0) + (mainRect.width / 2) - 50,
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
            setTutorialPosition(safeRect);
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
      content: "Este é o seu novo painel de mecânico. Vamos te mostrar como tudo funciona para você ser o melhor mecânico da Summer.",
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
      content: "Confira o valor total aqui. Você pode ver o subtotal de cada categoria caso queira explicar ao cliente antes de cobrar.",
      target: "tutorial-summary",
      tab: "summary"
    },
    {
      title: "Perfil do Mecânico",
      content: "Este é o seu espaço pessoal. Aqui você acompanha seu progresso e obrigações com a Summer Garage.",
      target: "tutorial-mechanic",
      tab: "mechanic"
    },
    {
      title: "Metas de Farm",
      content: "Acompanhe quanto você já farmou no dia, na semana e no mês. Você pode selecionar o item farmado no seletor ao lado para lançar manualmente.",
      target: "tutorial-all-farms",
      tab: "mechanic"
    },
    {
      title: "Lançamento Manual",
      content: "Fez um farm? Digite a quantidade aqui e clique em OK. Ele soma automaticamente no seu total diário e semanal.",
      target: "tutorial-manual-farm",
      tab: "mechanic"
    },
    {
      title: "Histórico de Vendas",
      content: "Acompanhe todas as suas vendas registradas através do Sales Tracker. Você pode ver o faturamento por dia ou o total geral.",
      target: "tutorial-sales-tracker",
      tab: "mechanic"
    },
    {
      title: "Meta Financeira",
      content: "Fique de olho na sua meta semanal. O sistema mostra o valor que você deve atingir até o próximo domingo.",
      target: "tutorial-finance-goal",
      tab: "mechanic"
    },
    {
      title: "Status de Pagamento",
      content: "Clique aqui para marcar se sua meta semanal está Pendente, Em Dia ou Paga. Mantenha isso sempre atualizado!",
      target: "tutorial-finance-status",
      tab: "mechanic"
    },
    {
      title: "Itens Necessários",
      content: "Estes são os itens que você deve focar no seu farm para manter o estoque da Summer Garage em dia.",
      target: "tutorial-items-list",
      tab: "mechanic"
    }
  ];
  
  const [showSalesLog, setShowSalesLog] = useState(false);
  const [salesTrackerView, setSalesTrackerView] = useState<'totals' | 'calendar'>('totals');
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ text: string; visible: boolean }>({ text: '', visible: false });

  const getLocalDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const showTooltip = (text: string) => {
    if (showTutorial) return;
    setTooltip({ text, visible: true });
  };
  const hideTooltip = () => setTooltip({ text: '', visible: false });
  
  const [selectedFarmItem, setSelectedFarmItem] = useState('Caixa de ferramentas');
  const [isFarmDropdownOpen, setIsFarmDropdownOpen] = useState(false);
  const farmItems = [
    'Caixa de ferramentas',
    'Ferramentas',
    'Metal',
    'Aro de Roda',
    'Roda',
    'Aluminio'
  ];

  // Intelligent Auto-Reset Check (Every minute)
  useEffect(() => {
    const checkResets = () => {
      const getSPDate = () => {
        return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
      };

      const now = getSPDate();
      const lastDaily = new Date(mechanicState.lastDailyReset || mechanicState.lastUpdate);
      const lastWeekly = new Date(mechanicState.lastWeeklyReset || mechanicState.lastUpdate);

      const getWeekNumber = (d: Date) => {
        const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
        return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
      };

      let needsUpdate = false;
      const newState = { ...mechanicState };

      if (now.getDate() !== lastDaily.getDate() || now.getMonth() !== lastDaily.getMonth() || now.getFullYear() !== lastDaily.getFullYear()) {
        newState.dailyFarm = 0;
        Object.keys(newState.itemFarms).forEach(k => {
          newState.itemFarms[k].daily = 0;
        });
        newState.lastDailyReset = now.toISOString();
        needsUpdate = true;
        addToast('Sistema: Farm diário resetado automaticamente (Horário SP).', 'info');
      }

      if (getWeekNumber(now) !== getWeekNumber(lastWeekly)) {
        newState.weeklyFarm = 0;
        Object.keys(newState.itemFarms).forEach(k => {
          newState.itemFarms[k].weekly = 0;
        });
        newState.lastWeeklyReset = now.toISOString();
        needsUpdate = true;
        addToast('Sistema: Farm semanal resetado automaticamente (Horário SP).', 'info');
      }

      if (needsUpdate) {
        setMechanicState(newState);
      }
    };

    const interval = setInterval(checkResets, 60000);
    return () => clearInterval(interval);
  }, [mechanicState]);

  useEffect(() => {
    if (!isAnonymous) {
      localStorage.setItem('summer_garage_mechanic_state', JSON.stringify(mechanicState));
    }
  }, [mechanicState, isAnonymous]);

  const [farmInput, setFarmInput] = useState('');

  const handleAddFarm = () => {
    const amount = parseInt(farmInput);
    if (!isNaN(amount) && amount > 0) {
      setMechanicState((prev: any) => {
        const newItemFarms = { ...prev.itemFarms };
        if (newItemFarms[selectedFarmItem]) {
          newItemFarms[selectedFarmItem] = {
            daily: (newItemFarms[selectedFarmItem].daily || 0) + amount,
            weekly: (newItemFarms[selectedFarmItem].weekly || 0) + amount,
            monthly: (newItemFarms[selectedFarmItem].monthly || 0) + amount
          };
        }

        return {
          ...prev,
          dailyFarm: (prev.dailyFarm || 0) + amount,
          weeklyFarm: (prev.weeklyFarm || 0) + amount,
          monthlyFarm: ((prev.monthlyFarm as number) || 0) + amount,
          itemFarms: newItemFarms,
          lastUpdate: new Date().toISOString()
        };
      });
      setFarmInput('');
      addToast(`Adicionado ${amount} de ${selectedFarmItem}!`, 'success');
      
      // Reporting to Discord
      if (user && !isAnonymous) {
        fetch('/api/debug/farm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user: user.displayName || user.username,
            id: user.id,
            amount: amount,
            item: selectedFarmItem,
            monthlyFarm: mechanicState.monthlyFarm + amount
          })
        }).catch(() => {});
      }
    }
  };

  const resetDailyFarm = () => {
    setMechanicState((prev: any) => {
      const newItemFarms = { ...prev.itemFarms };
      Object.keys(newItemFarms).forEach(k => {
        newItemFarms[k].daily = 0;
      });
      return { ...prev, dailyFarm: 0, itemFarms: newItemFarms };
    });
    addToast('Farm diário resetado!', 'info');
  };

  const resetWeeklyFarm = () => {
    setMechanicState((prev: any) => {
      const newItemFarms = { ...prev.itemFarms };
      Object.keys(newItemFarms).forEach(k => {
        newItemFarms[k].weekly = 0;
      });
      return { ...prev, weeklyFarm: 0, itemFarms: newItemFarms };
    });
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

  useEffect(() => {
    if (user) {
      const hasReportedOpen = sessionStorage.getItem(`reported_open_${user.id}`);
      const endpoint = hasReportedOpen ? '/api/debug/open' : '/api/debug/login';
      
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: user.displayName || user.username,
          id: user.id,
          platform: navigator.platform
        })
      }).catch(() => {});

      sessionStorage.setItem(`reported_open_${user.id}`, 'true');
    }
  }, [user]);

  const fetchUser = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        
        // Sign into Firebase if custom token is provided
        if (data.firebaseToken) {
          try {
            await signInWithCustomToken(auth, data.firebaseToken);
            console.log('Successfully signed into Firebase with custom token.');
            setIsFirebaseReady(true);
          } catch (err) {
            console.error('Error signing into Firebase with custom token:', err);
            setIsFirebaseReady(true); // Set to true anyway to allow fallback attempts
          }
        } else {
          setIsFirebaseReady(true);
        }
        
        setUser(data);
      } else {
        setUser(null);
        setIsFirebaseReady(true);
      }
    } catch (e) {
      setUser(null);
      setIsFirebaseReady(true);
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
      if (!isAnonymous) {
        await fetch('/api/auth/logout');
      }
      setUser(null);
      setIsAnonymous(false);
      setMechanicState(getDefaultMechanicState());
      setTooltip({ visible: false, text: '' });
      addToast('Sessão encerrada');
    } catch (e) {
      addToast('Erro ao sair', 'warning');
    }
  };

  const handleAnonymousLogin = () => {
    setIsAnonymous(true);
    setShowAnonymousWarning(false);
    setMechanicState(getDefaultMechanicState());
    setUser({
      id: 'anonymous',
      username: 'Anônimo',
      avatar: null,
      displayName: 'Mecânico Summer Garage',
      roles: []
    });
    
    // Log anonymous login
    axios.post('/api/debug/anonymous', {
      platform: /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'iOS' : /Android/i.test(navigator.userAgent) ? 'Android' : 'Desktop'
    }).catch(() => {});

    addToast('Acesso anônimo iniciado. Logs e salvamento desativados.', 'warning');
  };

  useEffect(() => {
    const handleUnload = () => {
      if (user && user.id !== 'anonymous') {
        const platform = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'iOS' : /Android/i.test(navigator.userAgent) ? 'Android' : 'Desktop';
        // Use sendBeacon for more reliable logging on close
        navigator.sendBeacon('/api/debug/close', JSON.stringify({
          user: user.username,
          id: user.id,
          platform
        }));
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [user]);

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
    // Prevent duplicate messages appearing at the same time
    setToasts(prev => {
      if (prev.some(t => t.message === message)) return prev;
      return [...prev, { id, message, type }];
    });
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000); // Increased duration slightly
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

  const clearForm = (silent = false) => {
    setUpgrades({ turboEnabled: false, motor: 0, freios: 0, transmissao: 0, suspensao: 0, blindagem: 0 });
    setItems({ reparoBasico: 0, reparoAvancado: 0, pneu: 0 });
    setAvulsos({ chaveInglesa: 0, elevador: 0, rastreador: 0, exaustor: 0 });
    setServicos({ distancia: 0, reparoExterno: false, trocaPneuExterna: false });
    if (!silent) addToast('Orçamento limpo com sucesso!', 'info');
  };

  const registerSale = () => {
    // Log sales before resetting if there's a total
    if (totals.total > 0) {
      const upgradeCount = Object.values(upgrades).filter(v => typeof v === 'number' ? v > 0 : v === true).length;
      const itemCount = Object.values(items).reduce((a: number, b: any) => a + (typeof b === 'number' ? b : 0), 0);
      const avulsoCount = Object.values(avulsos).reduce((a: number, b: any) => a + (typeof b === 'number' ? b : 0), 0);
      const serviceCount = (servicos.reparoExterno ? 1 : 0) + (servicos.trocaPneuExterna ? 1 : 0) + (servicos.distancia > 0 ? 1 : 0);

      const todayStr = getLocalDateString(new Date());
      
      // Reporting to Discord
      if (user && !isAnonymous) {
        const itemsList = [
          ...Object.entries(upgrades).filter(([_, v]) => v !== 0 && v !== false).map(([k, v]) => `${k}: ${v}`),
          ...Object.entries(items).filter(([_, v]) => (v as number) > 0).map(([k, v]) => `${k}: ${v}`),
          ...Object.entries(avulsos).filter(([_, v]) => (v as number) > 0).map(([k, v]) => `${k}: ${v}`),
          ...Object.entries(servicos).filter(([k, v]) => v !== 0 && v !== false).map(([k, v]) => `${k}: ${v}`)
        ];

        fetch('/api/debug/sale', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user: user.displayName || user.username,
            id: user.id,
            total: totals.total,
            items: itemsList,
            platform: navigator.platform,
            userAgent: navigator.userAgent,
            monthlyFarm: (((mechanicState.monthlyFarm as number) || 0) + (itemCount as number) + (avulsoCount as number))
          })
        }).catch(() => {});
      }

      setMechanicState((prev: any) => {
        const currentHistory = prev.salesLog?.history?.[todayStr] || { upgrades: 0, items: 0, avulsos: 0, services: 0, totalValue: 0, count: 0 };
        
        return {
          ...prev,
          dailyFarm: (Number(prev.dailyFarm) || 0) + Number(itemCount) + Number(avulsoCount),
          weeklyFarm: (Number(prev.weeklyFarm) || 0) + Number(itemCount) + Number(avulsoCount),
          monthlyFarm: (Number(prev.monthlyFarm) || 0) + Number(itemCount) + Number(avulsoCount),
          salesLog: {
            ...prev.salesLog,
            upgrades: (prev.salesLog?.upgrades || 0) + upgradeCount,
            items: (prev.salesLog?.items || 0) + itemCount,
            avulsos: (prev.salesLog?.avulsos || 0) + avulsoCount,
            services: (prev.salesLog?.services || 0) + serviceCount,
            totalValue: (prev.salesLog?.totalValue || 0) + totals.total,
            count: (prev.salesLog?.count || 0) + 1,
            history: {
              ...(prev.salesLog?.history || {}),
              [todayStr]: {
                upgrades: currentHistory.upgrades + upgradeCount,
                items: currentHistory.items + itemCount,
                avulsos: currentHistory.avulsos + avulsoCount,
                services: currentHistory.services + serviceCount,
                totalValue: currentHistory.totalValue + totals.total,
                count: currentHistory.count + 1
              }
            }
          },
          lastUpdate: new Date().toISOString()
        };
      });
      addToast('Venda registrada no histórico!', 'success');
      clearForm(true);
    } else {
      addToast('Não há itens no orçamento para registrar!', 'warning');
    }
  };

  return (
    <ErrorBoundary>
      <TooltipContext.Provider value={{ showTooltip, hideTooltip }}>
      <div className="min-h-screen bg-zinc-950 pb-32 md:pb-0 md:pl-0 relative overflow-x-hidden scroll-smooth">
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
            <AnimatePresence>
              {globalState.broadcast && (
                <motion.div 
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="bg-red-600 text-white text-[10px] font-black uppercase tracking-[0.2em] py-2 text-center relative z-50 shadow-lg"
                >
                  <div className="flex items-center justify-center gap-2">
                    <AlertTriangle size={12} className="animate-pulse" />
                    {globalState.broadcast}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Restricted Access Page Glow */}
            <motion.div 
              animate={{ 
                opacity: [0.1, 0.2, 0.1],
                scale: [1, 1.1, 1]
              }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="absolute inset-0 z-0 pointer-events-none"
              style={{
                background: 'radial-gradient(circle at center, rgba(220, 38, 38, 0.15) 0%, transparent 70%)'
              }}
            />

            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="max-w-md w-full bg-zinc-900/40 backdrop-blur-md border border-zinc-800 p-8 rounded-[2.5rem] relative overflow-hidden group shadow-2xl shadow-black/50"
            >
              {/* Refraction effect */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-100 pointer-events-none" />
              
                  <div className="relative z-10 flex flex-col items-center text-center space-y-6 sm:space-y-8">
                    <div className="relative">
                      <motion.div 
                        animate={{ 
                          y: [0, -8, 0],
                          filter: [
                            "drop-shadow(0 0 0px rgba(220, 38, 38, 0))",
                            "drop-shadow(0 0 15px rgba(220, 38, 38, 0.4))",
                            "drop-shadow(0 0 0px rgba(220, 38, 38, 0))"
                          ]
                        }}
                        transition={{
                          duration: 4,
                          repeat: Infinity,
                          ease: "easeInOut"
                        }}
                        className="w-28 h-28 sm:w-36 sm:h-36 flex items-center justify-center"
                      >
                        <img 
                          src="https://pub-a1b327e0f0794695b6f7d05baa938672.r2.dev/image.png"
                          alt="Summer Garage Logo"
                          className="w-full h-auto object-contain"
                          referrerPolicy="no-referrer"
                        />
                      </motion.div>
                    </div>

                    <div className="space-y-2">
                      <h2 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tighter italic leading-none">
                        Acesso <span className="text-red-600">Restrito</span>
                      </h2>
                      <p className="text-zinc-400 text-[10px] sm:text-xs font-medium leading-relaxed">
                        Esta ferramenta é exclusiva para os mecânicos <span className="text-white font-bold">Summer Garage</span>.<br />
                        Vincule seu Discord para continuar.
                      </p>
                    </div>

                <motion.button 
                  whileHover={{ scale: 1.05, boxShadow: "0 0 25px rgba(239, 68, 68, 0.4)" }}
                  whileTap={{ scale: 0.95 }}
                  animate={{ 
                    boxShadow: ["0 0 0 0px rgba(239, 68, 68, 0)", "0 0 20px 5px rgba(239, 68, 68, 0.2)", "0 0 0 0px rgba(239, 68, 68, 0)"]
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                  onClick={handleLogin}
                  className="w-full bg-red-600 hover:bg-red-700 text-white py-4 rounded-2xl font-black uppercase tracking-tighter text-lg shadow-lg shadow-red-900/20 transition-all flex items-center justify-center gap-3 group/btn relative overflow-hidden"
                >
                  <img 
                    src="https://pub-a1b327e0f0794695b6f7d05baa938672.r2.dev/Discord-Symbol-White.png" 
                    alt="Discord" 
                    className="w-6 h-auto group-hover/btn:scale-110 transition-transform"
                    referrerPolicy="no-referrer"
                  />
                  Vincular Discord
                </motion.button>

                <button 
                  onClick={() => setShowAnonymousWarning(true)}
                  className="w-full py-0.5 text-[10px] font-black text-red-500/80 hover:text-red-400 uppercase tracking-widest transition-colors"
                >
                  Entrar em anonimato
                </button>

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

      {/* Maintenance Overlay */}
      <AnimatePresence>
        {showAnonymousWarning && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ 
                scale: 1, 
                opacity: 1, 
                y: 0,
                boxShadow: ["0 0 20px rgba(220, 38, 38, 0.2)", "0 0 40px rgba(220, 38, 38, 0.4)", "0 0 20px rgba(220, 38, 38, 0.2)"]
              }}
              transition={{
                boxShadow: { duration: 2, repeat: Infinity, ease: "easeInOut" }
              }}
              className="max-w-3xl w-full max-h-[90vh] lg:max-h-none overflow-y-auto lg:overflow-visible bg-zinc-900 border-2 border-red-600/50 p-6 sm:p-8 rounded-[2.5rem] relative overflow-x-hidden text-center mx-4 no-scrollbar overscroll-contain"
            >
              <div className="flex justify-center mb-4">
                <div className="p-3 bg-red-600/20 rounded-2xl border border-red-600/30">
                  <AlertTriangle size={42} className="text-red-500" />
                </div>
              </div>
              
              <h3 className="text-xl sm:text-2xl font-black text-red-600 uppercase tracking-tighter italic mb-4">
                Aviso de Segurança e Privacidade
              </h3>
              
              <div className="space-y-3 text-center mb-4">
                <div className="text-xs sm:text-sm text-zinc-300 leading-relaxed space-y-2">
                  <p>
                    Entendemos sua preocupação, mas gostaríamos de esclarecer que o nosso sistema de vínculo <span className="text-white font-bold italic underline decoration-red-500/50">NÃO tem acesso técnico às suas mensagens privadas, fotos ou qualquer dado pessoal sensível.</span>
                  </p>
                  <p>
                    O acesso é <span className="text-red-500 font-bold italic">limitado estritamente à sua identidade básica pública do Discord.</span>
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
                  <div className="bg-zinc-800/50 border border-zinc-700/50 p-4 rounded-2xl">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield size={16} className="text-blue-400" />
                      <span className="text-xs font-black text-white uppercase tracking-wider">Segurança Enterprise</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      Possuímos protocolos de segurança e privacidade de nível empresarial, sendo certificados <span className="text-zinc-200 font-bold">SOC 2 Type II</span> e <span className="text-zinc-200 font-bold">CASA Tier II</span> por auditores externos.
                    </p>
                  </div>

                  <div className="bg-zinc-800/50 border border-zinc-700/50 p-4 rounded-2xl">
                    <div className="flex items-center gap-2 mb-2">
                      <Lock size={16} className="text-green-400" />
                      <span className="text-xs font-black text-white uppercase tracking-wider">Privacidade Máxima</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      Desde que você optou por não verificar o acesso via Discord conosco: <span className="text-zinc-200 font-bold italic">Ninguém — nem mesmo nós — pode ver seus dados.</span>
                    </p>
                  </div>
                </div>
                
                <div className="bg-blue-600/10 border border-blue-600/20 p-4 rounded-2xl space-y-1 text-center">
                  <p className="text-sm text-blue-400 font-medium leading-relaxed">
                    <span className="text-white font-bold italic">O nosso bot funciona de forma idêntica ao bot oficial da SummerRP</span>, que gerencia milhares de jogadores e staffs simultaneamente.
                  </p>
                  <p className="text-[11px] text-blue-300/80 leading-relaxed">
                    A única diferença é a escala: enquanto o bot global cuida de todo o servidor, o nosso é focado exclusivamente na organização da <span className="text-white font-bold">Summer Garage</span>. Ele solicita apenas o seu apelido para fins de identificação, registro de farms, vendas e monitoramento administrativo. O bot <span className="text-white font-bold">NÃO CONSEGUE</span> ler suas mensagens, acessar seu histórico ou enviar mensagens em seu nome.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <p className="text-xs text-zinc-400 leading-relaxed font-bold uppercase tracking-widest text-center">
                    Ao entrar em <span className="text-red-500">MODO ANÔNIMO</span>:
                  </p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-left">
                    <div className="flex items-start gap-2 text-[11px] text-zinc-500">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" />
                      <span><span className="text-zinc-300 font-bold">Sem Rastreamento:</span> Nenhum log será enviado. Sua produtividade será invisível.</span>
                    </div>
                    <div className="flex items-start gap-2 text-[11px] text-zinc-500">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" />
                      <span><span className="text-zinc-300 font-bold">Salvamento Off:</span> Cada sessão é nova; <span className="text-white font-bold">TUDO SERÁ PERDIDO</span> ao fechar.</span>
                    </div>
                    <div className="flex items-start gap-2 text-[11px] text-zinc-500">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" />
                      <span><span className="text-zinc-300 font-bold">Sem Suporte:</span> Dados perdidos não poderão ser recuperados tecnicamente.</span>
                    </div>
                    <div className="flex items-start gap-2 text-[11px] text-zinc-500">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" />
                      <span><span className="text-red-500 font-bold italic">Nota Importante:</span> A <span className="text-white">Comprovação Obrigatória</span> via fotos no seu canal de farm continua sendo o método oficial de conferência, respeitando as regras do servidor.</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex flex-col gap-3 pb-8 sm:pb-0">
                <button 
                  onClick={handleAnonymousLogin}
                  className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-black uppercase tracking-widest text-xs transition-all"
                >
                  Continuar com acesso anônimo
                </button>
                <button 
                  onClick={() => setShowAnonymousWarning(false)}
                  className="w-full py-2 text-[10px] font-black text-zinc-500 hover:text-white uppercase tracking-widest transition-colors"
                >
                  Voltar e Vincular Discord
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {globalState.maintenance && !isMaster && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[1000] bg-zinc-950 flex flex-col items-center justify-center p-8 text-center"
          >
            <div className="w-24 h-24 bg-red-600 rounded-[2rem] flex items-center justify-center mb-8 shadow-2xl shadow-red-900/40 animate-bounce">
              <Settings2 size={48} className="text-white animate-spin-slow" />
            </div>
            <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic mb-4">Em Manutenção</h2>
            <p className="text-zinc-500 max-w-md font-medium leading-relaxed">
              Estamos ajustando os motores! A oficina voltará a operar em breve. Por favor, tente novamente mais tarde.
            </p>
            <div className="mt-12 text-[10px] text-zinc-700 font-black uppercase tracking-[0.3em]">
              Summer Garage • 2026
            </div>
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
              <p className="text-[9px] text-zinc-500 uppercase tracking-[0.2em] font-bold mt-1 flex items-center gap-2">
                Mecânica Especializada
                {isMaster && (
                  <span className="text-[7px] bg-yellow-500/20 text-yellow-500 px-1 rounded animate-pulse border border-yellow-500/30">
                    DEVELOPER MODE
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Real-time Clock (Desktop) */}
          <button 
            onClick={toggleClockFormat}
            onMouseEnter={() => showTooltip("Clique para alternar formato 12h/24h")}
            onMouseLeave={hideTooltip}
            className="hidden md:flex flex-col items-center justify-center border-x border-zinc-800/50 px-10 h-full hover:bg-zinc-800/30 transition-colors group cursor-pointer"
          >
            <div className="text-2xl font-black text-white tracking-tighter italic leading-none tabular-nums group-hover:text-red-500 transition-colors">
              {time.toLocaleTimeString('pt-BR', { hour12: !is24Hour, hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="text-[9px] text-red-600 font-black uppercase tracking-[0.2em] mt-1.5 flex items-center gap-2">
              {time.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
              <span className="text-[7px] bg-zinc-800 px-1 rounded text-zinc-500 group-hover:text-white transition-colors">
                {is24Hour ? '24H' : '12H'}
              </span>
            </div>
          </button>

          {/* Real-time Clock (Mobile) */}
          <button 
            onClick={toggleClockFormat}
            onMouseEnter={() => showTooltip("Clique para alternar formato 12h/24h")}
            onMouseLeave={hideTooltip}
            className="md:hidden flex flex-col items-end justify-center active:scale-95 transition-transform"
          >
            <div className="text-lg font-black text-white tracking-tighter italic leading-none tabular-nums">
              {time.toLocaleTimeString('pt-BR', { hour12: !is24Hour, hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="text-[7px] text-red-600 font-black uppercase tracking-widest mt-1 flex items-center gap-1">
              {time.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
              <span className="text-[6px] opacity-50">{is24Hour ? '24H' : '12H'}</span>
            </div>
          </button>

          <div className="flex items-center gap-4">
            {user && (
              <div className="hidden sm:flex items-center gap-3 bg-zinc-900/50 border border-zinc-800 px-3 py-1.5 rounded-full">
                <div className="w-6 h-6 rounded-full overflow-hidden border border-red-600">
                  <img 
                    src={isAnonymous ? `https://pub-a1b327e0f0794695b6f7d05baa938672.r2.dev/silhouette-1345388323-612x612.png` : (user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : `https://cdn.discordapp.com/embed/avatars/0.png`)} 
                    alt={user.username}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <span className="text-xs font-bold text-zinc-300">{isAnonymous ? 'Anônimo' : user.username}</span>
                <button 
                  onClick={handleLogout} 
                  onMouseEnter={() => showTooltip("Encerrar Sessão")}
                  onMouseLeave={hideTooltip}
                  className="text-zinc-500 hover:text-red-500 transition-colors"
                >
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

      <main className="max-w-7xl mx-auto px-4 pt-8 pb-40 lg:pb-8 grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">
        {/* Mobile Tab Switcher - Hidden in favor of bottom bar */}
        <div id="tutorial-tabs" className="lg:col-span-12 lg:h-1 hidden lg:block" />

        {/* Left Column: Controls */}
        <div className="lg:col-span-8 space-y-8">
          {/* Desktop Tab Bar - Only for Staff to toggle Staff Panel */}
          {user && isStaff && (
            <div className="hidden lg:flex items-center gap-2 bg-zinc-900/50 p-1.5 rounded-2xl border border-zinc-800 mb-8">
              {[
                { id: 'upgrades', label: 'Tuning', icon: Zap },
                { id: 'staff', label: 'Staff', icon: Users },
              ].map(tab => {
                const Icon = tab.icon;
                // Active if it's the staff tab, or if it's the upgrades tab and we're not in staff/mechanic mode
                const isActive = tab.id === 'staff' ? activeTab === 'staff' : (activeTab !== 'staff' && activeTab !== 'mechanic');
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${isActive ? 'bg-red-600 text-white shadow-lg shadow-red-900/20' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'}`}
                  >
                    <Icon size={14} />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          )}

          <AnimatePresence mode="wait">
            <motion.div 
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              id="tutorial-calculator" 
              className={`space-y-8 ${(activeTab === 'summary' || activeTab === 'mechanic') ? 'hidden lg:block' : ''}`}
            >
            
            {/* Section: Upgrades */}
            <section className={`space-y-4 ${activeTab !== 'upgrades' && activeTab !== 'staff' ? 'hidden lg:block' : (activeTab === 'staff' ? 'hidden' : '')}`}>
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

            {/* Section: Staff Panel (Main Column) */}
            {activeTab === 'staff' && isStaff && (
              <section className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-red-500">
                    <Users size={24} />
                    <h2 className="text-xl font-black uppercase tracking-tight italic">Painel de Monitoramento Staff</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-zinc-900 border border-zinc-800 px-3 py-1 rounded-full text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                      {mechanicsList.length} Mecânicos Ativos
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {mechanicsList.length === 0 ? (
                    <div className="col-span-full text-center py-20 bg-zinc-900/30 border border-zinc-800/50 rounded-[2.5rem]">
                      <Users size={48} className="text-zinc-800 mx-auto mb-4" />
                      <p className="text-sm font-bold text-zinc-600 uppercase tracking-widest">Nenhum dado de mecânico disponível no momento</p>
                    </div>
                  ) : (
                    mechanicsList.map(mech => (
                      <div key={mech.id} className="bg-zinc-900/40 backdrop-blur-md border border-zinc-800 rounded-3xl p-6 hover:border-red-500/30 transition-all group relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                        
                        <div className="flex items-center justify-between mb-6">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-zinc-950 flex items-center justify-center border border-zinc-800 group-hover:border-red-500/30 transition-colors">
                              <User size={20} className="text-zinc-500 group-hover:text-red-500" />
                            </div>
                            <div>
                              <p 
                                className="text-sm font-black uppercase tracking-tight"
                                style={{ color: mech.roleColor || '#ffffff' }}
                              >
                                {mech.mechanicName}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <p className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest">ID: {mech.id.slice(0, 12)}...</p>
                                {mech.roles && mech.roles.length > 0 && (
                                  <span className="text-[7px] font-black text-zinc-500 uppercase px-1.5 py-0.5 bg-zinc-950 rounded border border-zinc-800">
                                    {mech.roles[0].name}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className={`px-3 py-1 rounded-full text-[9px] font-black tracking-widest ${
                            mech.financeStatus === 'PAGA' ? 'bg-green-500/10 text-green-500 border border-green-500/20' :
                            mech.financeStatus === 'EM DIA' ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' :
                            'bg-red-500/10 text-red-500 border border-red-500/20'
                          }`}>
                            {mech.financeStatus}
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3 mb-6">
                          <div className="bg-black/20 p-3 rounded-2xl text-center border border-white/5">
                            <p className="text-[8px] font-black text-zinc-600 uppercase mb-1">Hoje</p>
                            <p className="text-lg font-black text-white tracking-tighter">{mech.dailyFarm}</p>
                          </div>
                          <div className="bg-black/20 p-3 rounded-2xl text-center border border-white/5">
                            <p className="text-[8px] font-black text-zinc-600 uppercase mb-1">Semana</p>
                            <p className="text-lg font-black text-white tracking-tighter">{mech.weeklyFarm}</p>
                          </div>
                          <div className="bg-black/20 p-3 rounded-2xl text-center border border-white/5">
                            <p className="text-[8px] font-black text-zinc-600 uppercase mb-1">Mês</p>
                            <p className="text-lg font-black text-red-500 tracking-tighter">{mech.monthlyFarm}</p>
                          </div>
                        </div>

                        <div className="flex gap-3">
                          <button 
                            onClick={() => {
                              setViewingMechanicId(mech.id);
                              setActiveTab('mechanic');
                            }}
                            className="flex-1 bg-zinc-950 hover:bg-red-600 text-white py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 border border-zinc-800 hover:border-red-500"
                          >
                            <Eye size={12} />
                            Monitorar
                          </button>
                          <button 
                            onClick={() => {
                              setViewingMechanicId(mech.id);
                              setShowSalesLog(true);
                            }}
                            className="flex-1 bg-zinc-950 hover:bg-zinc-800 text-white py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 border border-zinc-800"
                          >
                            <History size={12} />
                            Vendas
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            )}

            {/* Section: Itens & Avulsos */}
            <div className={`grid grid-cols-1 md:grid-cols-2 gap-8 ${activeTab !== 'items' && activeTab !== 'staff' ? 'hidden lg:grid' : (activeTab === 'staff' ? 'hidden' : '')}`}>
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
          <section className={`space-y-4 ${activeTab !== 'services' && activeTab !== 'staff' ? 'hidden lg:block' : (activeTab === 'staff' ? 'hidden' : '')}`}>
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

          {/* Rules and Warnings Section (Main Column) */}
          <section className={`space-y-4 ${activeTab !== 'staff' ? 'hidden lg:block' : 'hidden'}`}>
            <div className="flex items-center gap-2 text-red-500">
              <AlertTriangle size={20} />
              <h2 className="text-lg font-bold uppercase tracking-tight">Regras e Avisos Importantes</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div 
                className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl hover:border-red-500/30 transition-all group"
                onMouseEnter={() => showTooltip("Prazos de pagamento e conferência de metas")}
                onMouseLeave={hideTooltip}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-red-500/10 rounded-xl group-hover:bg-red-500/20 transition-colors">
                    <Calendar size={20} className="text-red-500" />
                  </div>
                  <h4 className="text-sm font-black text-white uppercase tracking-widest">Prazos e Conferência</h4>
                </div>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                    <div className="space-y-1">
                      <p className="text-xs text-zinc-400 font-medium leading-relaxed">Dinheiro: <span className="text-white font-bold">todo domingo</span></p>
                      <div className="bg-black/20 p-2 rounded-lg border border-white/5 space-y-1">
                        <p className="text-[10px] text-zinc-300 font-bold flex items-center gap-1">
                          <span className="text-green-500">💵</span> Valor: R$ 15.000,00
                        </p>
                        <p className="text-[10px] text-zinc-400">
                          <span className="text-red-500">📥</span> Depósito: Passaporte 40 – CaZe Shakur
                        </p>
                      </div>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                    <div className="space-y-1">
                      <p className="text-xs text-zinc-400 font-medium leading-relaxed">Meta semanal: <span className="text-white font-bold">conferida toda segunda-feira</span></p>
                      <div className="bg-black/20 p-2 rounded-lg border border-white/5">
                        <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-tighter mb-1 flex items-center gap-1">
                          <span className="text-red-500">📌</span> Finalidade:
                        </p>
                        <ul className="space-y-0.5">
                          <li className="text-[9px] text-zinc-400">• Pagamento do Alvará</li>
                          <li className="text-[9px] text-zinc-400">• Aquisição do negócio</li>
                          <li className="text-[9px] text-zinc-400">• Upgrades futuros (baú)</li>
                        </ul>
                      </div>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                    <p className="text-xs text-zinc-500 font-medium italic leading-relaxed">No início, a conferência será feita diariamente</p>
                  </li>
                </ul>
              </div>

              <div 
                className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl hover:border-yellow-500/30 transition-all group"
                onMouseEnter={() => showTooltip("Avisos sobre penalidades e ausências")}
                onMouseLeave={hideTooltip}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-yellow-500/10 rounded-xl group-hover:bg-yellow-500/20 transition-colors">
                    <AlertTriangle size={20} className="text-yellow-500" />
                  </div>
                  <h4 className="text-sm font-black text-white uppercase tracking-widest">Avisos e Penalidades</h4>
                </div>
                <ul className="space-y-3">
                  <li className="flex items-center gap-3">
                    <span className="text-base filter drop-shadow-[0_0_8px_rgba(0,0,0,0.5)]">💵</span>
                    <p className="text-xs text-zinc-400 font-medium">Falta pagamento da meta semanal em dinheiro</p>
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="text-base filter drop-shadow-[0_0_8px_rgba(0,0,0,0.5)]">❗</span>
                    <p className="text-xs text-zinc-400 font-medium">Falta cumprimento da meta de itens</p>
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="text-base filter drop-shadow-[0_0_8px_rgba(0,0,0,0.5)]">❌</span>
                    <p className="text-xs text-zinc-400 font-medium">Sujeito a desligamento por reincidência</p>
                  </li>
                  <li className="flex items-start gap-3 pt-3 border-t border-zinc-800/50 mt-1">
                    <span className="text-base filter drop-shadow-[0_0_8px_rgba(0,0,0,0.5)]">⏳</span>
                    <p className="text-[11px] text-zinc-500 font-medium italic leading-relaxed">Ausências superiores a 3 dias, quando justificadas, poderão gerar abatimento da meta.</p>
                  </li>
                </ul>
                <div className="mt-4 pt-4 border-t border-zinc-800/50">
                  <p className="text-xs font-black text-white uppercase tracking-[0.2em] text-center italic">
                    Comunicação é obrigatória.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </motion.div>
      </AnimatePresence>
    </div>

        {/* Right Column: Summary (Desktop) */}
        <aside className={`lg:col-span-4 ${(activeTab === 'summary' || activeTab === 'mechanic' || activeTab === 'staff') ? 'block' : 'hidden lg:block'}`}>
          <AnimatePresence mode="wait">
            <motion.div 
              key={activeTab}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="sticky top-28 space-y-6"
            >
            {/* Summary Section - Hidden on mobile if tab is 'mechanic' */}
            <div id="tutorial-summary" className={`bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl shadow-black/50 ${activeTab === 'mechanic' || activeTab === 'staff' ? 'hidden lg:block' : 'block'}`}>
              <div 
                className="bg-red-600 p-6"
                onMouseEnter={() => showTooltip("Resumo Geral da Fatura")}
                onMouseLeave={hideTooltip}
              >
                <h2 className="text-white font-black uppercase tracking-tighter text-2xl italic">Resumo da Fatura</h2>
              </div>
              
              <div className="p-6 space-y-6">
                <div className="space-y-4">
                  <SummaryRow label="Subtotal Upgrades" value={totals.upgrades} />
                  <SummaryRow label="Subtotal Itens" value={totals.items} />
                  <SummaryRow label="Subtotal Serviços" value={totals.servicos} />
                </div>
                
                <div 
                  className="pt-6 border-t border-zinc-800"
                  onMouseEnter={() => showTooltip("Valor Total a ser Cobrado")}
                  onMouseLeave={hideTooltip}
                >
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1">Total Final</p>
                      <p className="text-4xl font-black text-white tracking-tighter">{formatCurrency(totals.total)}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <button 
                    onClick={registerSale}
                    onMouseEnter={() => showTooltip("Registrar Venda no Histórico")}
                    onMouseLeave={hideTooltip}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-widest py-4 rounded-2xl transition-all shadow-lg shadow-red-900/20 active:scale-95 flex items-center justify-center gap-2 group"
                  >
                    <CheckCircle2 size={20} className="group-hover:scale-110 transition-transform" />
                    Registrar Venda
                  </button>
                  
                  <button 
                    onClick={() => clearForm()}
                    onMouseEnter={() => showTooltip("Limpar Orçamento sem Registrar")}
                    onMouseLeave={hideTooltip}
                    className="w-full bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 font-bold py-3 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 text-xs uppercase tracking-widest border border-zinc-800"
                  >
                    <Trash2 size={14} />
                    Limpar Tudo
                  </button>
                </div>
              </div>
            </div>

            {/* Info Message repositioned between summary and mechanic - Hidden on mobile if tab is 'mechanic' */}
            <div className={`bg-zinc-900/50 border border-zinc-800 p-4 rounded-2xl flex items-start gap-3 ${activeTab === 'mechanic' || activeTab === 'staff' ? 'hidden lg:block' : 'flex'}`}>
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
                  className={`bg-zinc-900/40 backdrop-blur-md border ${isMaster ? 'border-yellow-500/30' : 'border-zinc-800'} p-6 rounded-3xl relative overflow-hidden group ${activeTab === 'summary' ? 'hidden lg:block' : 'block'}`}
                >
                  {isMaster && (
                    <div className="absolute top-0 right-0 p-2">
                      <Shield size={12} className="text-yellow-500 opacity-50" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                  
                  <div className="relative z-10 flex items-center gap-4 mb-6 lg:mb-4">
                    <div className="relative">
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden border-2 border-red-600 shadow-lg shadow-red-900/20">
                        <img 
                          src={isAnonymous ? `https://pub-a1b327e0f0794695b6f7d05baa938672.r2.dev/silhouette-1345388323-612x612.png` : (user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : `https://cdn.discordapp.com/embed/avatars/0.png`)} 
                          alt={user.username}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="absolute -bottom-1 -right-1 bg-green-500 w-4 h-4 rounded-full border-2 border-zinc-900" />
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        {isMaster && (
                          <span className="text-[10px] font-black text-yellow-500 uppercase tracking-[0.2em] animate-pulse">
                            DEVELOPER
                          </span>
                        )}
                        {!isAnonymous && (
                          user.roles && user.roles.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {user.roles.map((role: any) => (
                                <span key={role.name} className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: role.color }}>
                                  {role.name}
                                </span>
                              ))
                              }
                            </div>
                          ) : (
                            <span className="text-[10px] font-black text-red-500 uppercase tracking-[0.2em]">
                              MECÂNICO AUTORIZADO
                            </span>
                          )
                        )}
                      </div>
                      <div className="flex flex-col">
                        <h2 
                          className="text-lg sm:text-xl font-black uppercase tracking-tighter italic leading-none truncate"
                          style={{ color: user?.roleColor || '#ffffff' }}
                        >
                          {isAnonymous ? 'Mecânico Summer Garage' : (mechanicState.mechanicName || user?.displayName || user?.username)}
                        </h2>
                        {!isAnonymous && user && (
                          <p className="text-[7px] text-zinc-700 font-mono mt-1 uppercase tracking-widest">
                            ID: {user.id} {isStaff && <span className="text-red-500 ml-2">• STAFF ACCESS</span>}
                          </p>
                        )}
                      </div>
                      {!isAnonymous && user && (
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <span className="bg-zinc-800 text-zinc-400 text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-widest">ID: {user.id.slice(-6)}</span>
                          {user.roles && user.roles.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {user.roles.map((role: any, idx: number) => (
                                <span 
                                  key={idx} 
                                  className="text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter border"
                                  style={{ 
                                    color: role.color, 
                                    borderColor: `${role.color}33`,
                                    backgroundColor: `${role.color}11`
                                  }}
                                >
                                  {role.name}
                                </span>
                              ))}
                            </div>
                          )}
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
                      )}
                    </div>
                  </div>

                  {/* Master Panel Section */}
                  {isMaster && (
                    <div className="mt-8 pt-6 border-t border-yellow-500/20 space-y-4">
                      <div className="flex items-center gap-2 text-yellow-500 mb-4">
                        <Shield size={16} />
                        <h3 className="text-xs font-black uppercase tracking-[0.2em]">DEV MODE ACTIVATED</h3>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button 
                          onClick={() => {
                            setMechanicState((prev: any) => ({
                              ...prev,
                              salesLog: { upgrades: 0, items: 0, avulsos: 0, services: 0, totalValue: 0, count: 0, history: {} }
                            }));
                            addToast('MODO MASTER: Histórico Global Resetado!', 'warning');
                          }}
                          className="bg-yellow-500/10 border border-yellow-500/30 p-3 rounded-xl text-[10px] font-black text-yellow-500 uppercase tracking-widest hover:bg-yellow-500/20 transition-all flex items-center justify-center gap-2"
                        >
                          <Trash2 size={12} />
                          Reset Global Log
                        </button>
                        <button 
                          id="tutorial-master-goals"
                          onClick={() => {
                            setTempGoals(goals);
                            setShowGoalModal(true);
                          }}
                          className="bg-yellow-500/10 border border-yellow-500/30 p-3 rounded-xl text-[10px] font-black text-yellow-500 uppercase tracking-widest hover:bg-yellow-500/20 transition-all flex items-center justify-center gap-2"
                        >
                          <Zap size={12} />
                          Set Goals
                        </button>
                      </div>
                      
                      <div className="bg-zinc-950/80 p-4 rounded-2xl border border-yellow-500/10">
                        <p className="text-[9px] text-zinc-500 uppercase font-bold mb-2 tracking-widest">Debug Info</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                          <p className="text-[9px] text-zinc-400 font-mono truncate">ID: {user.id}</p>
                          <p className="text-[9px] text-zinc-400 font-mono">Tab: {activeTab}</p>
                          <p className="text-[9px] text-zinc-400 font-mono">OS: {navigator.platform}</p>
                          <p className="text-[9px] text-zinc-400 font-mono">Sales: {mechanicState.salesLog?.count || 0}</p>
                          <p className="text-[9px] text-zinc-400 font-mono col-span-2">Status: <span className="text-green-500">ROOT_ACCESS</span></p>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="mt-6 space-y-6">
                    {activeTab === 'staff' && isStaff ? (
                      <div className="space-y-4 lg:hidden">
                        <div className="flex items-center justify-between">
                          <h3 className="text-[10px] font-black text-red-500 uppercase tracking-[0.3em] italic">Monitoramento de Staff</h3>
                          <div className="flex items-center gap-2">
                            <span className="text-[8px] font-bold text-zinc-500 uppercase">{mechanicsList.length} Mecânicos</span>
                          </div>
                        </div>
                        <p className="text-[9px] text-zinc-500 italic leading-relaxed">
                          No desktop, utilize o painel expandido na coluna principal para uma melhor visualização.
                        </p>
                      </div>
                    ) : (
                      <>
                        {viewingMechanicId && (
                          <button 
                            onClick={() => {
                              setViewingMechanicId(null);
                              setActiveTab('staff');
                            }}
                            className="flex items-center gap-2 text-zinc-500 hover:text-red-500 transition-colors text-[9px] font-black uppercase tracking-widest mb-4"
                          >
                            <ArrowLeft size={12} />
                            Voltar para Lista
                          </button>
                        )}
                        <div className="lg:hidden pt-4 border-t border-zinc-800/50">
                          <h3 className="text-[10px] font-black text-red-500 uppercase tracking-[0.3em] mb-4 italic">Metas e Produtividade</h3>
                        </div>

                        <div 
                          id="tutorial-finance-goal"
                          className="bg-zinc-950/50 rounded-2xl p-4 border border-zinc-800/50"
                          onMouseEnter={() => showTooltip("Sua Meta Financeira Semanal")}
                          onMouseLeave={hideTooltip}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <div className="p-1.5 bg-green-500/10 rounded-lg">
                                <Zap size={14} className="text-green-500" />
                              </div>
                              <h4 className="text-[11px] font-black text-white uppercase tracking-widest italic">Meta Financeira Semanal</h4>
                            </div>
                            <button 
                              id="tutorial-sales-tracker"
                              onClick={() => setShowSalesLog(true)}
                              onMouseEnter={() => showTooltip("Ver Histórico de Vendas")}
                              onMouseLeave={hideTooltip}
                              className="flex items-center gap-1.5 px-2 py-1 bg-red-600/10 hover:bg-red-600/20 border border-red-600/20 rounded-lg transition-all group active:scale-95"
                            >
                              <Gauge size={12} className="text-red-500 group-hover:rotate-12 transition-transform" />
                              <span className="text-[9px] font-black text-red-500 uppercase tracking-widest">Sales Tracker</span>
                            </button>
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
                                disabled={!!viewingMechanicId}
                                onClick={toggleFinanceStatus}
                                className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-tighter transition-all ${
                                  activeMechanicData.financeStatus === 'PAGA' ? 'bg-green-500/20 text-green-500' :
                                  activeMechanicData.financeStatus === 'EM DIA' ? 'bg-blue-500/20 text-blue-500' :
                                  'bg-red-500/20 text-red-500'
                                } ${viewingMechanicId ? 'cursor-default' : 'active:scale-95 hover:scale-105'}`}
                              >
                                {activeMechanicData.financeStatus}
                              </button>
                            </div>
                          </div>
                        </div>

                        <div 
                          id="tutorial-all-farms"
                          className="grid grid-cols-1 sm:grid-cols-3 gap-3"
                        >
                          <div 
                            id="tutorial-daily-farm" 
                            className="relative bg-zinc-950/50 rounded-2xl p-4 border border-zinc-800/50"
                            onMouseEnter={() => showTooltip("Progresso de Farm Diário")}
                            onMouseLeave={hideTooltip}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <Package size={14} className="text-red-500" />
                              <h4 className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Daily Farm</h4>
                            </div>
                            <p className="text-lg font-black text-white tracking-tighter">{activeMechanicData.dailyFarm} <span className="text-[10px] text-zinc-500 uppercase">/ {goals.dailyItems}</span></p>
                            {!viewingMechanicId && (
                              <button 
                                onClick={resetDailyFarm}
                                className="absolute bottom-3 right-3 p-1.5 text-zinc-700 hover:text-red-500 transition-colors bg-black/20 rounded-lg"
                                title="Resetar Dia"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                          <div 
                            id="tutorial-weekly-farm" 
                            className="relative bg-zinc-950/50 rounded-2xl p-4 border border-zinc-800/50"
                            onMouseEnter={() => showTooltip("Progresso de Farm Semanal")}
                            onMouseLeave={hideTooltip}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <Shield size={14} className="text-red-500" />
                              <h4 className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Weekly Farm</h4>
                            </div>
                            <p className="text-lg font-black text-white tracking-tighter">{activeMechanicData.weeklyFarm} <span className="text-[10px] text-zinc-500 uppercase">/ {goals.weeklyItems}</span></p>
                          </div>
                          <div 
                            id="tutorial-monthly-farm" 
                            className="relative bg-zinc-950/50 rounded-2xl p-4 border border-zinc-800/50"
                            onMouseEnter={() => showTooltip("Progresso de Farm Mensal")}
                            onMouseLeave={hideTooltip}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <Target size={14} className="text-red-500" />
                              <h4 className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Monthly Farm</h4>
                            </div>
                            <p className="text-lg font-black text-red-500 tracking-tighter">{activeMechanicData.monthlyFarm} <span className="text-[10px] text-zinc-500 uppercase">/ {goals.monthlyItems}</span></p>
                          </div>
                        </div>
                      </>
                    )}
                  
                    {/* Manual Farm Entry */}
                    <div id="tutorial-manual-farm" className="bg-red-600/5 border border-red-600/20 rounded-xl p-3">
                      <p className="text-[9px] font-black text-red-500 uppercase mb-2 tracking-widest">Lançar Farm Manual</p>
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          {/* Custom Dropdown */}
                          <div className="flex-1 relative">
                            <button 
                              onClick={() => setIsFarmDropdownOpen(!isFarmDropdownOpen)}
                              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-[10px] font-bold text-white flex items-center justify-between hover:border-red-500/30 transition-colors"
                            >
                              <span className="truncate">{selectedFarmItem}</span>
                              <ChevronDown size={12} className={`text-red-500 transition-transform ${isFarmDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>

                            <AnimatePresence>
                              {isFarmDropdownOpen && (
                                <>
                                  <motion.div 
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    onClick={() => setIsFarmDropdownOpen(false)}
                                    className="fixed inset-0 z-40"
                                  />
                                  <motion.div 
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                    className="absolute left-0 right-0 bottom-full mb-2 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50"
                                  >
                                    <div className="max-h-48 overflow-y-auto no-scrollbar p-1">
                                      {farmItems.map((item) => (
                                        <button
                                          key={item}
                                          onClick={() => {
                                            setSelectedFarmItem(item);
                                            setIsFarmDropdownOpen(false);
                                          }}
                                          className={`w-full text-left px-3 py-2 text-[10px] font-bold rounded-lg transition-colors ${
                                            selectedFarmItem === item 
                                              ? 'bg-red-600 text-white' 
                                              : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                                          }`}
                                        >
                                          {item}
                                        </button>
                                      ))}
                                    </div>
                                  </motion.div>
                                </>
                              )}
                            </AnimatePresence>
                          </div>

                          <div className="flex-[1.5] relative">
                            <input 
                              type="number" 
                              value={farmInput}
                              onChange={(e) => setFarmInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleAddFarm();
                                }
                              }}
                              onMouseEnter={() => showTooltip("Digitar volume de peças manualmente")}
                              onMouseLeave={hideTooltip}
                              placeholder="Quantidade..."
                              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 pr-8 text-xs text-white focus:outline-none focus:border-red-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            {farmInput && (
                              <button 
                                onClick={() => setFarmInput('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 p-1"
                              >
                                <X size={12} />
                              </button>
                            )}
                          </div>
                          <button 
                            onClick={handleAddFarm}
                            className="bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded-lg text-[10px] font-black transition-all active:scale-90"
                          >
                            OK
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Items List */}
                    <div 
                      id="tutorial-items-list" 
                      className="space-y-2"
                      onMouseEnter={() => showTooltip("Lista detalhada de materiais necessários para as metas")}
                      onMouseLeave={hideTooltip}
                    >
                      <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Itens Necessários</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {[
                          { name: 'Caixa de ferramentas', icon: '🧰' },
                          { name: 'Ferramentas', icon: '🛠️' },
                          { name: 'Metal', icon: '🔩' },
                          { name: 'Aro de Roda', icon: '🛞' },
                          { name: 'Roda', icon: '🛞' },
                          { name: 'Aluminio', icon: '🔗' }
                        ].map((item) => {
                          const farm = mechanicState.itemFarms?.[item.name] || { daily: 0, weekly: 0, monthly: 0 };
                          return (
                            <div 
                              key={item.name} 
                              className="flex flex-col p-2 bg-white/[0.02] border border-white/5 rounded-lg group hover:border-red-500/30 transition-colors cursor-help"
                              onMouseEnter={() => showTooltip(`Progresso de ${item.name}: ${farm.daily}/${goals.dailyItems} hoje`)}
                              onMouseLeave={hideTooltip}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs">{item.icon}</span>
                                  <span className="text-[9px] font-bold text-zinc-400 uppercase">{item.name}</span>
                                </div>
                                <div className="text-right">
                                  <span className="text-[9px] font-black text-zinc-500 tracking-tighter">
                                    <span className="text-red-500/80">{farm.daily}</span>
                                    <span className="mx-0.5 text-zinc-700">/</span>
                                    <span className="text-zinc-400">{goals.dailyItems}</span>
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-[7px] font-bold text-zinc-600 uppercase">Semanal</span>
                                <span className="text-[8px] font-bold text-zinc-500">
                                  {farm.weekly} / {goals.weeklyItems}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-[7px] font-bold text-zinc-600 uppercase">Mensal</span>
                                <span className="text-[8px] font-bold text-zinc-500">
                                  {farm.monthly} / {goals.monthlyItems}
                                </span>
                              </div>
                            </div>
                          );
                        })}
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
                      onMouseEnter={() => showTooltip("Encerrar Sessão")}
                      onMouseLeave={hideTooltip}
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
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-zinc-950/90 backdrop-blur-2xl border-t border-zinc-800/50 shadow-[0_-10px_40px_rgba(0,0,0,0.8)]">
        <div className="flex items-center overflow-x-auto no-scrollbar px-4 pt-3 pb-8 gap-6 snap-x snap-mandatory touch-pan-x">
          <div className="flex items-center justify-between flex-1 min-w-max gap-6">
            {[
              { id: 'upgrades', icon: Zap, label: 'Tuning' },
              { id: 'items', icon: Disc, label: 'Itens' },
              { id: 'services', icon: Truck, label: 'Serviços' },
              { id: 'summary', icon: Settings2, label: 'Fatura', special: true },
              { id: 'mechanic', icon: User, label: 'Perfil' },
              ...(isStaff ? [{ id: 'staff', icon: Users, label: 'Staff' }] : []),
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button 
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  onMouseEnter={() => showTooltip(tab.label)}
                  onMouseLeave={hideTooltip}
                  className={`relative flex flex-col items-center gap-1.5 px-3 py-1 transition-all duration-300 snap-center ${isActive ? 'text-red-500 scale-110' : 'text-zinc-500 hover:text-zinc-300'} ${tab.special ? 'bg-red-600/10 rounded-2xl border border-red-600/20 px-4' : ''}`}
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
          </div>
          
          <div className="w-px h-6 bg-zinc-800/50 shrink-0" />
          
          <div className="flex items-center gap-1 shrink-0">
            <button 
              disabled
              className="p-2.5 text-zinc-900 cursor-not-allowed opacity-10 pointer-events-none"
              onMouseEnter={() => showTooltip("Função Desativada")}
              onMouseLeave={hideTooltip}
            >
              <Copy size={18} />
            </button>

            <button 
              onClick={() => {
                localStorage.removeItem('summer_garage_tutorial_seen');
                setTutorialStep(0);
                setShowTutorial(true);
                addToast('Iniciando guia...', 'info');
              }}
              onMouseEnter={() => showTooltip("Ver Tutorial")}
              onMouseLeave={hideTooltip}
              className="p-2.5 text-zinc-500 hover:text-white transition-all active:scale-90"
            >
              <HelpCircle size={18} />
            </button>

            <button 
              onClick={registerSale}
              onMouseEnter={() => showTooltip("Registrar Venda")}
              onMouseLeave={hideTooltip}
              className="bg-red-600/10 hover:bg-red-600/20 text-red-500 p-2.5 rounded-xl transition-all active:scale-90 border border-red-500/20"
            >
              <CheckCircle2 size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Toast Notifications */}
      <div className={`fixed ${window.innerWidth < 768 ? 'bottom-32' : 'top-24'} right-4 left-4 md:left-auto z-[400] flex flex-col gap-3 pointer-events-none`}>
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.95 }}
              className={`
                pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] border backdrop-blur-md min-w-[280px]
                ${toast.type === 'success' ? 'bg-zinc-900/90 border-green-500/20 text-green-400 shadow-green-900/10' : ''}
                ${toast.type === 'warning' ? 'bg-zinc-900/90 border-red-500/20 text-red-400 shadow-red-900/10' : ''}
                ${toast.type === 'info' ? 'bg-zinc-900/90 border-blue-500/20 text-blue-400 shadow-blue-900/10' : ''}
              `}
            >
              {toast.type === 'success' && <CheckCircle2 size={18} />}
              {toast.type === 'warning' && <AlertTriangle size={18} />}
              {toast.type === 'info' && <Info size={18} />}
              <p className="text-sm font-bold tracking-tight whitespace-pre-line">{toast.message}</p>
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

      {/* Custom Mouse-Following Tooltip */}
      <AnimatePresence>
        {tooltip.visible && user && window.innerWidth >= 768 && !showTutorial && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5, y: 10 }}
            animate={{ 
              opacity: 1, 
              scale: 1, 
              x: mousePos.x + 15,
              y: mousePos.y + 15
            }}
            exit={{ opacity: 0, scale: 0.5, y: 10 }}
            transition={{ type: "spring", damping: 25, stiffness: 300, mass: 0.5 }}
            className="fixed top-0 left-0 z-[1000] pointer-events-none"
          >
            <div className="bg-zinc-900/80 backdrop-blur-xl border border-white/10 px-3 py-1.5 rounded-xl shadow-2xl flex items-center gap-2">
              <div className="w-1 h-1 bg-red-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-black text-white uppercase tracking-widest whitespace-nowrap italic">
                {tooltip.text}
              </span>
              {/* Refraction effect */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-50 rounded-xl" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sales Log Modal */}
      <AnimatePresence>
        {showSalesLog && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowSalesLog(false)}
            className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-zinc-900 border border-red-600/30 rounded-3xl sm:rounded-[2.5rem] shadow-[0_0_50px_rgba(220,38,38,0.15)] no-scrollbar overscroll-contain"
            >
              <div className="p-6 sm:p-10">
                <div className="flex items-center justify-between mb-6 sm:mb-8">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="p-2 sm:p-3 bg-red-600/10 rounded-xl sm:rounded-2xl">
                      <Gauge size={24} className="text-red-600 sm:hidden" />
                      <Gauge size={32} className="text-red-600 hidden sm:block" />
                    </div>
                    <div>
                      <h2 className="text-xl sm:text-3xl font-black text-white uppercase tracking-tighter italic leading-none">Sales Tracker</h2>
                      <p className="text-[10px] sm:text-sm text-zinc-500 uppercase tracking-widest font-bold mt-1 sm:mt-2">
                        {activeMechanicData.mechanicName || user?.displayName || user?.username}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowSalesLog(false)}
                    className="p-2 sm:p-3 bg-zinc-800 hover:bg-red-600 text-zinc-400 hover:text-white rounded-full transition-all active:scale-90"
                  >
                    <X size={20} className="sm:hidden" />
                    <X size={24} className="hidden sm:block" />
                  </button>
                </div>

                {/* View Toggle */}
                <div className="flex bg-zinc-950 p-1 sm:p-1.5 rounded-xl sm:rounded-2xl mb-6 sm:mb-8 border border-zinc-800">
                  <button 
                    onClick={() => setSalesTrackerView('totals')}
                    className={`flex-1 py-2 sm:py-3 text-[9px] sm:text-[11px] font-black uppercase tracking-widest rounded-lg sm:rounded-xl transition-all ${salesTrackerView === 'totals' ? 'bg-red-600 text-white shadow-lg shadow-red-900/20' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    VENDAS TOTAL
                  </button>
                  <button 
                    onClick={() => setSalesTrackerView('calendar')}
                    className={`flex-1 py-2 sm:py-3 text-[9px] sm:text-[11px] font-black uppercase tracking-widest rounded-lg sm:rounded-xl transition-all ${salesTrackerView === 'calendar' ? 'bg-red-600 text-white shadow-lg shadow-red-900/20' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    VENDAS DIA/MES
                  </button>
                </div>

                <AnimatePresence mode="wait">
                  {salesTrackerView === 'totals' ? (
                    <motion.div 
                      key="totals"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="space-y-8"
                    >
                      <div className="grid grid-cols-2 gap-4 sm:gap-6">
                        <div className="bg-zinc-950/50 p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] border border-zinc-800">
                          <p className="text-[9px] sm:text-[11px] text-zinc-500 uppercase font-black tracking-widest mb-1 sm:mb-2">Total Vendas</p>
                          <p className="text-xl sm:text-3xl font-black text-white italic">{activeMechanicData.salesLog?.count || 0}</p>
                        </div>
                        <div className="bg-zinc-950/50 p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] border border-zinc-800 flex flex-col justify-center">
                          <p className="text-[9px] sm:text-[11px] text-zinc-500 uppercase font-black tracking-widest mb-1 sm:mb-2">Valor Acumulado</p>
                          <p className="text-base sm:text-xl font-black text-red-600 italic leading-tight">{formatCurrency(activeMechanicData.salesLog?.totalValue || 0)}</p>
                        </div>
                      </div>

                      <div className="space-y-3 sm:space-y-4">
                        <SalesLogItem icon={<Zap size={16} className="sm:hidden" />} desktopIcon={<Zap size={18} />} label="Upgrades Performance" value={activeMechanicData.salesLog?.upgrades || 0} />
                        <SalesLogItem icon={<Package size={16} className="sm:hidden" />} desktopIcon={<Package size={18} />} label="Itens de Venda" value={activeMechanicData.salesLog?.items || 0} />
                        <SalesLogItem icon={<Joystick size={16} className="sm:hidden" />} desktopIcon={<Joystick size={18} />} label="Itens Avulsos" value={activeMechanicData.salesLog?.avulsos || 0} />
                        <SalesLogItem icon={<Truck size={16} className="sm:hidden" />} desktopIcon={<Truck size={18} />} label="Serviços & Externos" value={activeMechanicData.salesLog?.services || 0} />
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div 
                      key="calendar"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-4"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <button 
                          onClick={() => setCalendarDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                          className="p-1.5 sm:p-2 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-white transition-colors"
                        >
                          <ChevronLeft size={14} className="sm:hidden" />
                          <ChevronLeft size={16} className="hidden sm:block" />
                        </button>
                        <h3 className="text-[10px] sm:text-xs font-black text-zinc-400 uppercase tracking-widest">
                          {new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(calendarDate)}
                        </h3>
                        <button 
                          onClick={() => setCalendarDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                          className="p-1.5 sm:p-2 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-white transition-colors"
                        >
                          <ChevronRight size={14} className="sm:hidden" />
                          <ChevronRight size={16} className="hidden sm:block" />
                        </button>
                      </div>
                      
                      <div className="grid grid-cols-7 gap-1">
                        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((day, i) => (
                          <div key={i} className="text-[8px] font-black text-zinc-600 text-center py-1">{day}</div>
                        ))}
                        {(() => {
                          const year = calendarDate.getFullYear();
                          const month = calendarDate.getMonth();
                          const firstDay = new Date(year, month, 1).getDay();
                          const daysInMonth = new Date(year, month + 1, 0).getDate();
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          
                          const cells = [];
                          for (let i = 0; i < firstDay; i++) {
                            cells.push(<div key={`empty-${i}`} className="aspect-square" />);
                          }
                          
                          for (let d = 1; d <= daysInMonth; d++) {
                            const date = new Date(year, month, d);
                            const dateStr = getLocalDateString(date);
                            const daySales = activeMechanicData.salesLog?.history?.[dateStr];
                            const isToday = getLocalDateString(new Date()) === dateStr;
                            const isFuture = date > today;
                            const isSelected = selectedDay === dateStr;
                            const hasSales = daySales && daySales.count > 0;
                            
                            cells.push(
                              <motion.div 
                                key={d} 
                                whileHover={!isFuture ? { scale: 1.05 } : {}}
                                whileTap={!isFuture ? { scale: 0.95 } : {}}
                                onClick={() => !isFuture && setSelectedDay(isSelected ? null : dateStr)}
                                className={`aspect-square rounded-lg border flex flex-col items-center justify-center relative group transition-all cursor-pointer ${
                                  isFuture ? 'border-zinc-800/30 bg-zinc-950/10 opacity-40 cursor-not-allowed' :
                                  isSelected ? 'border-red-500 bg-red-600 text-white shadow-[0_0_15px_rgba(220,38,38,0.3)]' :
                                  isToday ? 'border-red-600 bg-red-600/20' : 
                                  hasSales ? 'border-red-900/50 bg-red-950/20' :
                                  'border-zinc-800 bg-zinc-950/30 hover:border-zinc-600'
                                }`}
                                onMouseEnter={() => !isFuture && daySales && showTooltip(`${daySales.count} vendas - ${formatCurrency(daySales.totalValue)}`)}
                                onMouseLeave={hideTooltip}
                              >
                                <span className={`text-[9px] sm:text-[10px] font-bold ${isFuture ? 'text-zinc-700' : isSelected ? 'text-white' : isToday ? 'text-white' : hasSales ? 'text-red-400' : 'text-zinc-500'}`}>{d}</span>
                                {hasSales && !isSelected && (
                                  <div className="absolute bottom-1 w-0.5 h-0.5 sm:w-1 sm:h-1 bg-red-600 rounded-full shadow-[0_0_4px_#ef4444]" />
                                )}
                              </motion.div>
                            );
                          }
                          return cells;
                        })()}
                      </div>
                      
                      <AnimatePresence mode="wait">
                        {selectedDay ? (
                          <motion.div 
                            key="day-details"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="bg-zinc-950/80 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-red-600/20 mt-4"
                          >
                            <div className="flex items-center justify-between mb-2 sm:mb-3">
                              <p className="text-[8px] sm:text-[9px] text-zinc-500 uppercase font-black tracking-widest">
                                Detalhes de {new Date(selectedDay + 'T00:00:00').toLocaleDateString('pt-BR')}
                              </p>
                              <button onClick={() => setSelectedDay(null)} className="text-zinc-600 hover:text-white">
                                <X size={12} />
                              </button>
                            </div>
                            {activeMechanicData.salesLog?.history?.[selectedDay] ? (
                              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                                <div>
                                  <p className="text-[7px] sm:text-[8px] text-zinc-600 uppercase font-bold mb-0.5 sm:mb-1">Vendas Realizadas</p>
                                  <p className="text-base sm:text-lg font-black text-white italic">{activeMechanicData.salesLog.history[selectedDay].count}</p>
                                </div>
                                <div>
                                  <p className="text-[7px] sm:text-[8px] text-zinc-600 uppercase font-bold mb-0.5 sm:mb-1">Faturamento</p>
                                  <p className="text-base sm:text-lg font-black text-red-600 italic">{formatCurrency(activeMechanicData.salesLog.history[selectedDay].totalValue)}</p>
                                </div>
                                <div className="col-span-2 grid grid-cols-4 gap-1 sm:gap-2 pt-2 border-t border-zinc-800/50">
                                  <div className="text-center">
                                    <p className="text-[6px] sm:text-[7px] text-zinc-600 uppercase font-bold">UPG</p>
                                    <p className="text-[10px] sm:text-xs font-black text-white">{activeMechanicData.salesLog.history[selectedDay].upgrades}</p>
                                  </div>
                                  <div className="text-center">
                                    <p className="text-[6px] sm:text-[7px] text-zinc-600 uppercase font-bold">ITM</p>
                                    <p className="text-[10px] sm:text-xs font-black text-white">{activeMechanicData.salesLog.history[selectedDay].items}</p>
                                  </div>
                                  <div className="text-center">
                                    <p className="text-[6px] sm:text-[7px] text-zinc-600 uppercase font-bold">AVL</p>
                                    <p className="text-[10px] sm:text-xs font-black text-white">{activeMechanicData.salesLog.history[selectedDay].avulsos}</p>
                                  </div>
                                  <div className="text-center">
                                    <p className="text-[6px] sm:text-[7px] text-zinc-600 uppercase font-bold">SRV</p>
                                    <p className="text-[10px] sm:text-xs font-black text-white">{activeMechanicData.salesLog.history[selectedDay].services}</p>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <p className="text-[9px] sm:text-[10px] text-zinc-600 italic text-center py-2">Nenhuma venda registrada neste dia.</p>
                            )}
                          </motion.div>
                        ) : (
                          <motion.div 
                            key="today-summary"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="bg-zinc-950/50 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-zinc-800 mt-4"
                          >
                            <p className="text-[8px] sm:text-[9px] text-zinc-500 uppercase font-black tracking-widest mb-1 sm:mb-2">Resumo de Hoje</p>
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] sm:text-xs font-bold text-white">{mechanicState.salesLog?.history?.[getLocalDateString(new Date())]?.count || 0} Vendas</span>
                              <span className="text-[10px] sm:text-xs font-black text-red-500">{formatCurrency(mechanicState.salesLog?.history?.[getLocalDateString(new Date())]?.totalValue || 0)}</span>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="mt-8 pt-6 border-t border-zinc-800">
                  <button 
                    onClick={() => {
                      if (confirm('Tem certeza que deseja resetar todo o histórico de vendas?')) {
                        setMechanicState((prev: any) => ({
                          ...prev,
                          salesLog: { upgrades: 0, items: 0, avulsos: 0, services: 0, totalValue: 0, count: 0, history: {} }
                        }));
                        addToast('Histórico resetado!', 'info');
                      }
                    }}
                    className="w-full py-3 text-[10px] font-black text-zinc-600 hover:text-red-500 uppercase tracking-[0.2em] transition-colors flex items-center justify-center gap-2"
                  >
                    <Trash2 size={12} />
                    Resetar Histórico
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Goal Modal (Master Only) */}
      <AnimatePresence>
        {showGoalModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowGoalModal(false)}
            className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm max-h-[90vh] overflow-y-auto bg-zinc-900 border border-yellow-500/30 rounded-[2rem] shadow-[0_0_50px_rgba(234,179,8,0.1)] no-scrollbar overscroll-contain"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-yellow-500/10 rounded-xl">
                      <Target size={24} className="text-yellow-500" />
                    </div>
                    <h2 className="text-xl font-black text-white uppercase tracking-tighter italic">Set Goals</h2>
                  </div>
                  <button onClick={() => setShowGoalModal(false)} className="text-zinc-500 hover:text-white">
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 block">Meta Financeira ($)</label>
                    <input 
                      type="number"
                      value={tempGoals.money}
                      onChange={(e) => setTempGoals(prev => ({ ...prev, money: parseInt(e.target.value) || 0 }))}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white font-bold focus:ring-2 focus:ring-yellow-500 focus:outline-none transition-all"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 block">Meta Diária</label>
                      <input 
                        type="number"
                        value={tempGoals.dailyItems}
                        onChange={(e) => setTempGoals(prev => ({ ...prev, dailyItems: parseInt(e.target.value) || 0 }))}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white font-bold focus:ring-2 focus:ring-yellow-500 focus:outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 block">Meta Semanal</label>
                      <input 
                        type="number"
                        value={tempGoals.weeklyItems}
                        onChange={(e) => setTempGoals(prev => ({ ...prev, weeklyItems: parseInt(e.target.value) || 0 }))}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white font-bold focus:ring-2 focus:ring-yellow-500 focus:outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 block">Meta Mensal</label>
                      <input 
                        type="number"
                        value={tempGoals.monthlyItems}
                        onChange={(e) => setTempGoals(prev => ({ ...prev, monthlyItems: parseInt(e.target.value) || 0 }))}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white font-bold focus:ring-2 focus:ring-yellow-500 focus:outline-none transition-all"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-8 space-y-3">
                  <button 
                    onClick={() => {
                      setGoals(tempGoals);
                      setShowGoalModal(false);
                      addToast('Metas atualizadas com sucesso!', 'success');
                    }}
                    className="w-full bg-yellow-500 hover:bg-yellow-600 text-black py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-yellow-900/20 transition-all active:scale-95"
                  >
                    Salvar Metas
                  </button>
                  <button 
                    onClick={() => {
                      const defaults = { money: 15000, dailyItems: 100, weeklyItems: 600, monthlyItems: 2400 };
                      setGoals(defaults);
                      setTempGoals(defaults);
                      setShowGoalModal(false);
                      addToast('Metas resetadas para o padrão!', 'info');
                    }}
                    className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all"
                  >
                    Resetar para Padrão
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tutorial Overlay */}
      <AnimatePresence>
        {showTutorial && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[250] pointer-events-none"
          >
            {/* Spotlight & Highlight (Universal) */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
              <defs>
                <mask id="spotlight-mask">
                  <rect x="0" y="0" width="100%" height="100%" fill="white" />
                  <motion.rect 
                    initial={{
                      x: window.innerWidth / 2 - 50,
                      y: window.innerHeight / 2 - 50,
                      width: 100,
                      height: 100
                    }}
                    animate={{
                      x: (tutorialPosition.width || 0) > 0 ? (tutorialPosition.left || 0) - 12 : window.innerWidth / 2 - 50,
                      y: (tutorialPosition.width || 0) > 0 ? (tutorialPosition.top || 0) - 12 : window.innerHeight / 2 - 50,
                      width: (tutorialPosition.width || 0) > 0 ? (tutorialPosition.width || 0) + 24 : 100,
                      height: (tutorialPosition.width || 0) > 0 ? (tutorialPosition.height || 0) + 24 : 100,
                    }}
                    transition={{ type: "spring", damping: 45, stiffness: 90 }}
                    rx="20" 
                    fill="black" 
                  />
                </mask>
              </defs>
              <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.85)" mask="url(#spotlight-mask)" />
            </svg>

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
                top: { type: "spring", damping: 45, stiffness: 90 },
                left: { type: "spring", damping: 45, stiffness: 90 },
                width: { type: "spring", damping: 45, stiffness: 90 },
                height: { type: "spring", damping: 45, stiffness: 90 },
                scale: { duration: 3, repeat: Infinity, ease: "easeInOut" }
              }}
              className="absolute border-2 border-red-600 rounded-3xl shadow-[0_0_50px_rgba(220,38,38,0.6)] pointer-events-none z-[255]"
            />

            {/* Tutorial Box */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={window.innerWidth < 768 ? { 
                opacity: 1, 
                scale: 1, 
                top: tutorialPosition.width > 0 
                  ? (tutorialPosition.top + tutorialPosition.height + 20 > window.innerHeight - 300
                      ? Math.max(20, tutorialPosition.top - 320)
                      : tutorialPosition.top + tutorialPosition.height + 20)
                  : window.innerHeight / 2 - 150,
                left: tutorialPosition.width > 0
                  ? Math.max(20, Math.min(window.innerWidth - 300, tutorialPosition.left + (tutorialPosition.width / 2) - 140))
                  : window.innerWidth / 2 - 140,
                y: 0 
              } : {
                opacity: 1, 
                scale: 1,
                top: tutorialPosition.width > 0 
                  ? (tutorialPosition.height > window.innerHeight * 0.8
                      ? window.innerHeight / 2 - 150 
                      : (tutorialPosition.width > window.innerWidth * 0.6
                          ? (tutorialPosition.top < 100 
                              ? tutorialPosition.top + tutorialPosition.height + 60
                              : (tutorialPosition.top + tutorialPosition.height + 80 > window.innerHeight - 320
                                  ? Math.max(20, tutorialPosition.top - 360)
                                  : Math.max(20, tutorialPosition.top + tutorialPosition.height + 60)))
                          : Math.max(20, Math.min(window.innerHeight - 340, tutorialPosition.top + (tutorialPosition.height / 2) - 160))))
                  : window.innerHeight / 2 - 150,
                left: tutorialPosition.width > 0
                  ? (tutorialPosition.width > window.innerWidth * 0.6
                      ? Math.max(20, Math.min(window.innerWidth - 340, (window.innerWidth / 2) - 160)) 
                      : (tutorialPosition.left + (tutorialPosition.width / 2) > window.innerWidth / 2
                          ? Math.max(20, tutorialPosition.left - 340) 
                          : Math.max(20, Math.min(window.innerWidth - 340, tutorialPosition.left + tutorialPosition.width + 20)))) 
                  : window.innerWidth / 2 - 160,
                y: 0
              }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ 
                type: "spring", 
                damping: 45, 
                stiffness: 90 
              }}
              className={`z-[260] w-full max-w-[280px] bg-zinc-900 border border-red-600/30 p-6 rounded-[2rem] shadow-[0_0_30px_rgba(220,38,38,0.15)] overflow-hidden pointer-events-auto fixed`}
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-zinc-800">
                <motion.div 
                  className="h-full bg-red-600"
                  initial={{ width: "0%" }}
                  animate={{ width: `${((tutorialStep + 1) / tutorialSteps.length) * 100}%` }}
                />
              </div>

              <div className="flex items-center justify-between mb-4 mt-2">
                <span className="text-[10px] font-black text-white uppercase tracking-widest italic">
                  Passo <span className="text-red-600">{tutorialStep + 1}</span> de <span className="text-red-600">{tutorialSteps.length}</span>
                </span>
              </div>

              <h3 className="text-lg font-black text-white uppercase tracking-tighter italic mb-2">
                {tutorialSteps[tutorialStep].title}
              </h3>
              
              <p className="text-xs text-zinc-400 leading-relaxed mb-6">
                {tutorialSteps[tutorialStep].content}
              </p>

              <div className="flex items-center gap-2">
                {tutorialStep > 0 && (
                  <button 
                    onClick={() => setTutorialStep(prev => prev - 1)}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
                  >
                    Voltar
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
                  className="flex-[2] bg-red-600 hover:bg-red-500 text-white py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-red-900/20"
                >
                  {tutorialStep < tutorialSteps.length - 1 ? 'Próximo' : 'Entendido!'}
                </button>
              </div>

              <button 
                onClick={closeTutorial}
                className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white transition-all active:scale-90 group"
                title="Pular Tutorial"
              >
                <motion.div
                  animate={{ 
                    filter: [
                      "drop-shadow(0 0 2px rgba(220,38,38,0))", 
                      "drop-shadow(0 0 12px rgba(220,38,38,0.9))", 
                      "drop-shadow(0 0 2px rgba(220,38,38,0))"
                    ],
                    scale: [1, 1.1, 1]
                  }}
                  transition={{ 
                    duration: 1.5, 
                    repeat: Infinity, 
                    ease: "easeInOut" 
                  }}
                >
                  <X size={20} className="group-hover:text-red-500 transition-colors" />
                </motion.div>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </TooltipContext.Provider>
    </ErrorBoundary>
  );
}

// --- Sub-components ---

function UpgradeCard({ icon, title, price, value, onChange, max = 5 }: { 
  icon: ReactNode, 
  title: string, 
  price: number, 
  value: number, 
  onChange: (v: number) => void,
  max?: number
}) {
  const { showTooltip, hideTooltip } = useTooltip();
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { 
      style: 'currency', 
      currency: 'USD',
      currencyDisplay: 'narrowSymbol' 
    }).format(val).replace('US$', '$');
  };
  
  return (
    <div 
      className="bg-zinc-900/40 backdrop-blur-md border border-zinc-800 p-5 rounded-2xl space-y-4 hover:border-red-900/50 transition-all h-full flex flex-col justify-between relative overflow-hidden group active:scale-[0.97]"
      onMouseEnter={() => showTooltip(`Ajustar nível de ${title}`)}
      onMouseLeave={hideTooltip}
    >
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
          <span>Máx Nível {max}</span>
        </div>
        <input 
          type="range" min="0" max={max} step="1" 
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
  const { showTooltip, hideTooltip } = useTooltip();
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { 
      style: 'currency', 
      currency: 'USD',
      currencyDisplay: 'narrowSymbol' 
    }).format(val).replace('US$', '$');
  };

  return (
    <div 
      className="bg-zinc-900/40 backdrop-blur-md border border-zinc-800 p-4 rounded-2xl flex items-center justify-between hover:border-red-900/50 transition-all relative overflow-hidden group active:scale-[0.97]"
      onMouseEnter={() => showTooltip(`Quantidade de ${title}`)}
      onMouseLeave={hideTooltip}
    >
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
            className="p-3 sm:p-2 hover:bg-zinc-700 rounded-lg text-zinc-400 disabled:opacity-30 transition-all active:scale-90"
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
            className="p-3 sm:p-2 hover:bg-zinc-700 rounded-lg text-red-500 disabled:opacity-30 transition-all active:scale-90"
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
  const { showTooltip, hideTooltip } = useTooltip();
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { 
      style: 'currency', 
      currency: 'USD',
      currencyDisplay: 'narrowSymbol' 
    }).format(val).replace('US$', '$');
  };

  return (
    <label 
      className="flex items-center justify-between p-4 sm:p-3 bg-zinc-800/50 rounded-xl border border-transparent hover:border-zinc-700 transition-all cursor-pointer group active:scale-[0.97]"
      onMouseEnter={() => showTooltip(`${checked ? 'Remover' : 'Adicionar'} ${label}`)}
      onMouseLeave={hideTooltip}
    >
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

function SalesLogItem({ icon, desktopIcon, label, value }: { icon: ReactNode, desktopIcon?: ReactNode, label: string, value: number }) {
  const { showTooltip, hideTooltip } = useTooltip();
  return (
    <div 
      className="flex items-center justify-between p-3 sm:p-4 bg-zinc-950/30 rounded-xl sm:rounded-2xl border border-zinc-800/30"
      onMouseEnter={() => showTooltip(`Total de ${label}`)}
      onMouseLeave={hideTooltip}
    >
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="text-red-600">
          {desktopIcon ? (
            <>
              <span className="sm:hidden">{icon}</span>
              <span className="hidden sm:block">{desktopIcon}</span>
            </>
          ) : icon}
        </div>
        <span className="text-[10px] sm:text-xs font-bold text-zinc-400 uppercase tracking-widest">{label}</span>
      </div>
      <span className="text-sm sm:text-base font-black text-white tabular-nums">{value}</span>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string, value: number }) {
  const { showTooltip, hideTooltip } = useTooltip();
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { 
      style: 'currency', 
      currency: 'USD',
      currencyDisplay: 'narrowSymbol' 
    }).format(val).replace('US$', '$');
  };
  return (
    <div 
      className="flex justify-between items-center py-1 sm:py-0"
      onMouseEnter={() => showTooltip(`Valor de ${label}`)}
      onMouseLeave={hideTooltip}
    >
      <span className="text-zinc-500 text-xs sm:text-sm font-medium">{label}</span>
      <span className="text-zinc-200 text-sm sm:text-base font-black tabular-nums">{formatCurrency(value)}</span>
    </div>
  );
}
