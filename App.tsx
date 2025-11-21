import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Eye, Sparkles, Zap, Database, Scan, ChevronUp, Activity, Microscope, RotateCcw, AlertTriangle, X, Check } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { INITIAL_RESOURCES, MAX_FOCUS_BASE, FOCUS_REGEN_BASE, UPGRADES, BASE_GAZE_COOLDOWN_MS, SAVE_KEY } from './constants';
import { GameResources, CelestialBody, CelestialType, Upgrade, LogEntry, Constellation } from './types';
import { generateCelestialDiscovery, analyzeCelestialBody, generateConstellationName } from './services/gemini';
import StarMap from './components/StarMap';

const App: React.FC = () => {
  // State
  const [resources, setResources] = useState<GameResources>(INITIAL_RESOURCES);
  const [stars, setStars] = useState<CelestialBody[]>([]);
  const [constellations, setConstellations] = useState<Constellation[]>([]);
  const [selectedStar, setSelectedStar] = useState<CelestialBody | null>(null);
  const [upgrades, setUpgrades] = useState<Upgrade[]>(UPGRADES);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  const [isScanning, setIsScanning] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  
  // Gaze Mechanics State
  const [isGazing, setIsGazing] = useState(false);
  const lastGazeTimeRef = useRef<number>(0);
  const gazeIntervalRef = useRef<number | null>(null);
  const gazeButtonRef = useRef<HTMLButtonElement>(null);

  // --- Persistence ---
  useEffect(() => {
    const loadGame = () => {
      const savedData = localStorage.getItem(SAVE_KEY);
      if (savedData) {
        try {
          const parsed = JSON.parse(savedData);
          if (parsed.resources) setResources(parsed.resources);
          if (parsed.stars) setStars(parsed.stars);
          if (parsed.constellations) setConstellations(parsed.constellations);
          if (parsed.logs) setLogs(parsed.logs);
          
          // FIX: Do NOT blindly set parsed upgrades as they lack functions.
          // Map saved levels onto the fresh UPGRADES constants.
          if (parsed.upgrades) {
             const savedUpgrades = parsed.upgrades as Upgrade[];
             setUpgrades(UPGRADES.map(def => {
                 const saved = savedUpgrades.find(s => s.id === def.id);
                 return saved ? { ...def, level: saved.level } : def;
             }));
          }
        } catch (e) {
          console.error("Failed to load save", e);
        }
      }
      setIsLoaded(true);
    };
    loadGame();
  }, []);

  // Auto-Save
  useEffect(() => {
    if (!isLoaded) return;
    const saveTimer = window.setInterval(() => {
        const stateToSave = {
            resources,
            stars,
            constellations,
            upgrades,
            logs: logs.slice(0, 20)
        };
        localStorage.setItem(SAVE_KEY, JSON.stringify(stateToSave));
    }, 2000);
    return () => window.clearInterval(saveTimer);
  }, [isLoaded, resources, stars, constellations, upgrades, logs]);

  const performReset = () => {
      localStorage.removeItem(SAVE_KEY);
      setResources(INITIAL_RESOURCES);
      setStars([]);
      setConstellations([]);
      setUpgrades(UPGRADES);
      setLogs([]);
      setSelectedStar(null);
      setIsScanning(false);
      setIsAnalyzing(false);
      setShowResetConfirm(false);
      addLog("Universe Reset. Welcome back, Observer.", "warning");
  };

  // --- Game Loop & Passive Gen ---
  useEffect(() => {
    if (!isLoaded) return;
    const interval = window.setInterval(() => {
      setResources(prev => {
        const maxFocus = MAX_FOCUS_BASE + (upgrades.find(u => u.id === 'focus_condenser')?.level || 0) * 50;
        const focusRegen = FOCUS_REGEN_BASE + (upgrades.find(u => u.id === 'stabilizers')?.level || 0);
        const passiveStarlight = (upgrades.find(u => u.id === 'sensor_array')?.level || 0) * 0.5;

        return {
          ...prev,
          focus: Math.min(maxFocus, prev.focus + focusRegen),
          starlight: prev.starlight + passiveStarlight,
        };
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [upgrades, isLoaded]);

  // --- Constellation Logic ---
  const checkForConstellations = useCallback(async (currentStars: CelestialBody[], currentConstellations: Constellation[]) => {
      if (currentStars.length < 3) return;

      // 1. Build Adjacency Graph
      const adj = new Map<string, string[]>();
      currentStars.forEach(s => adj.set(s.id, []));
      const MAX_DIST = 180;

      for (let i = 0; i < currentStars.length; i++) {
          for (let j = i + 1; j < currentStars.length; j++) {
              const s1 = currentStars[i];
              const s2 = currentStars[j];
              const dist = Math.hypot(s1.coordinates.x - s2.coordinates.x, s1.coordinates.y - s2.coordinates.y);
              if (dist < MAX_DIST) {
                  adj.get(s1.id)?.push(s2.id);
                  adj.get(s2.id)?.push(s1.id);
              }
          }
      }

      // 2. Find Connected Components (Clusters)
      const visited = new Set<string>();
      const clusters: string[][] = [];

      for (const star of currentStars) {
          if (!visited.has(star.id)) {
              const cluster: string[] = [];
              const stack = [star.id];
              visited.add(star.id);
              
              while (stack.length > 0) {
                  const currentId = stack.pop()!;
                  cluster.push(currentId);
                  const neighbors = adj.get(currentId) || [];
                  for (const neighborId of neighbors) {
                      if (!visited.has(neighborId)) {
                          visited.add(neighborId);
                          stack.push(neighborId);
                      }
                  }
              }
              if (cluster.length >= 3) {
                  clusters.push(cluster);
              }
          }
      }

      // 3. Merge with Existing Constellations or Create New
      let updatedConstellations = [...currentConstellations];
      let hasChanges = false;

      for (const cluster of clusters) {
          // Check if this cluster overlaps with any existing constellation
          const overlaps = updatedConstellations.filter(c => 
              c.starIds.some(id => cluster.includes(id))
          );

          if (overlaps.length === 0) {
              // NEW Constellation found!
              const name = await generateConstellationName(cluster.length);
              const newConstellation: Constellation = {
                  id: uuidv4(),
                  name,
                  starIds: cluster,
                  discoveredAt: Date.now()
              };
              
              updatedConstellations.push(newConstellation);
              hasChanges = true;
              
              // Reward
              const rewardStarlight = 50 + (cluster.length * 10);
              const rewardData = 20 + (cluster.length * 5);
              setResources(prev => ({
                  ...prev,
                  starlight: prev.starlight + rewardStarlight,
                  data: prev.data + rewardData
              }));
              addLog(`Constellation Charted: ${name}! (+${rewardStarlight} Light, +${rewardData} Data)`, 'constellation');

          } else {
              // Existing constellation(s) found. 
              // If multiple overlaps, we conceptually merge them into the first one.
              // If single overlap, we update it if size changed.
              
              const primaryC = overlaps[0];
              
              // Check if we have new stars in this cluster that aren't in the primaryC
              const currentSet = new Set(primaryC.starIds);
              const hasNewStars = cluster.some(id => !currentSet.has(id));
              
              if (hasNewStars || overlaps.length > 1) {
                  // Merge all stars from cluster and overlaps into primaryC
                  const mergedIds = new Set([...primaryC.starIds, ...cluster]);
                  
                  // If we are merging multiple old constellations, consume their stars too
                  for (let i = 1; i < overlaps.length; i++) {
                      overlaps[i].starIds.forEach(id => mergedIds.add(id));
                      // Remove the obsolete constellation
                      updatedConstellations = updatedConstellations.filter(c => c.id !== overlaps[i].id);
                  }

                  // Update primary
                  updatedConstellations = updatedConstellations.map(c => 
                      c.id === primaryC.id ? { ...c, starIds: Array.from(mergedIds) } : c
                  );
                  hasChanges = true;
              }
          }
      }

      if (hasChanges) {
          setConstellations(updatedConstellations);
      }

  }, []);

  // Trigger constellation check when stars change
  useEffect(() => {
      if (isLoaded && stars.length > 0) {
          checkForConstellations(stars, constellations);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stars.length]); 


  // --- Helpers ---
  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [{ id: uuidv4(), timestamp: Date.now(), message, type }, ...prev].slice(0, 50));
  };

  // --- Gaze / Observation Mechanics ---
  const getGazeCooldown = useCallback(() => {
    const servoLevel = upgrades.find(u => u.id === 'optical_servos')?.level || 0;
    return Math.max(50, BASE_GAZE_COOLDOWN_MS * Math.pow(0.9, servoLevel));
  }, [upgrades]);

  const triggerGaze = useCallback(() => {
    const now = Date.now();
    const cooldown = getGazeCooldown();

    if (now - lastGazeTimeRef.current < cooldown) return;

    lastGazeTimeRef.current = now;

    const lensLevel = upgrades.find(u => u.id === 'lens_polishing')?.level || 0;
    const gain = 1 + lensLevel;
    setResources(prev => ({ ...prev, starlight: prev.starlight + gain }));

    if (gazeButtonRef.current) {
        const bar = gazeButtonRef.current.querySelector('.cooldown-bar') as HTMLElement;
        if (bar) {
            bar.style.transition = 'none';
            bar.style.width = '0%';
            void bar.offsetWidth; 
            bar.style.transition = `width ${cooldown}ms linear`;
            bar.style.width = '100%';
        }
    }
  }, [upgrades, getGazeCooldown]);

  useEffect(() => {
    if (isGazing) {
      triggerGaze();
      const cooldown = getGazeCooldown();
      gazeIntervalRef.current = window.setInterval(triggerGaze, cooldown);
    } else {
      if (gazeIntervalRef.current) {
        window.clearInterval(gazeIntervalRef.current);
        gazeIntervalRef.current = null;
      }
    }
    return () => {
      if (gazeIntervalRef.current) {
        window.clearInterval(gazeIntervalRef.current);
      }
    };
  }, [isGazing, triggerGaze, getGazeCooldown]);


  // --- Actions ---
  const calculateScanCost = () => {
    const depth = stars.length;
    const baseFocusCost = 20;
    const baseLightCost = 10;
    const focusCost = baseFocusCost + Math.floor(depth * 1.5);
    const lightCost = baseLightCost + Math.floor(depth * 0.5);
    return { focusCost, lightCost };
  };

  const handleScan = async () => {
    const { focusCost, lightCost } = calculateScanCost();
    if (resources.focus < focusCost || resources.starlight < lightCost || isScanning) return;

    setIsScanning(true);
    setResources(prev => ({ ...prev, focus: prev.focus - focusCost, starlight: prev.starlight - lightCost }));
    
    const depth = stars.length;
    const baseTime = 1000;
    const penalty = depth * 200;
    const scanMatrixLevel = upgrades.find(u => u.id === 'scan_matrix')?.level || 0;
    const reduction = Math.min(0.75, scanMatrixLevel * 0.15); 
    const totalTime = Math.max(500, (baseTime + penalty) * (1 - reduction));

    addLog(`Scanning sector (ETA: ${(totalTime/1000).toFixed(1)}s)...`, "info");

    try {
      await new Promise(resolve => setTimeout(resolve, totalTime));
      const coords = { x: Math.random() * 1000, y: Math.random() * 1000 };
      const data = await generateCelestialDiscovery(coords, stars.length);
      
      const newBody: CelestialBody = {
        id: uuidv4(),
        name: data.name || "Unknown",
        type: (data.type as CelestialType) || CelestialType.STAR,
        description: data.description || "No data available.",
        distanceLightYears: data.distanceLightYears || 0,
        coordinates: coords,
        color: data.color || "#ffffff",
        spectralClass: data.spectralClass,
        temperatureK: data.temperatureK,
        discoveryDate: Date.now(),
        analyzed: false
      };

      setStars(prev => [...prev, newBody]);
      addLog(`Discovery: ${newBody.name} (${newBody.type})`, "discovery");
      setResources(prev => ({ ...prev, data: prev.data + 5 })); 
    } catch (err) {
      addLog("Scan failed: Interference detected.", "warning");
    } finally {
      setIsScanning(false);
    }
  };

  const handleAnalyze = async () => {
    if (!selectedStar || selectedStar.analyzed || isAnalyzing) return;
    
    const processorLevel = upgrades.find(u => u.id === 'quantum_processor')?.level || 0;
    const discount = Math.min(0.5, processorLevel * 0.1); 
    const cost = Math.floor(50 * (1 - discount));

    if (resources.data < cost) {
        addLog(`Insufficient Data. Need ${cost}.`, "warning");
        return;
    }

    setIsAnalyzing(true);
    setResources(prev => ({ ...prev, data: prev.data - cost }));
    addLog(`Analyzing ${selectedStar.name}...`, "info");

    try {
        const detailedAnalysis = await analyzeCelestialBody(selectedStar);
        setStars(prev => prev.map(s => 
            s.id === selectedStar.id 
            ? { ...s, description: s.description + "\n\nAnalysis: " + detailedAnalysis, analyzed: true } 
            : s
        ));
        setSelectedStar(prev => prev ? { ...prev, description: prev.description + "\n\nAnalysis: " + detailedAnalysis, analyzed: true } : null);
        addLog(`Analysis complete for ${selectedStar.name}.`, "discovery");
    } catch (err) {
        addLog("Analysis failed.", "warning");
    } finally {
        setIsAnalyzing(false);
    }
  };

  const buyUpgrade = (upgradeId: string) => {
    const upgradeIndex = upgrades.findIndex(u => u.id === upgradeId);
    if (upgradeIndex === -1) return;
    const upgrade = upgrades[upgradeIndex];
    const cost = Math.floor(upgrade.baseCost * Math.pow(upgrade.costMultiplier, upgrade.level));

    if (resources.starlight >= cost && upgrade.level < upgrade.maxLevel) {
      setResources(prev => ({ ...prev, starlight: prev.starlight - cost }));
      const newUpgrades = [...upgrades];
      newUpgrades[upgradeIndex] = { ...upgrade, level: upgrade.level + 1 };
      setUpgrades(newUpgrades);
      addLog(`Upgraded ${upgrade.name} to Level ${upgrade.level + 1}`, "upgrade");
    }
  };

  const getUpgradeCost = (u: Upgrade) => Math.floor(u.baseCost * Math.pow(u.costMultiplier, u.level));
  const { focusCost, lightCost } = calculateScanCost();
  const canScan = resources.focus >= focusCost && resources.starlight >= lightCost && !isScanning;

  if (!isLoaded) return <div className="h-screen bg-space-950 text-white flex items-center justify-center">Initializing Observatory...</div>;

  return (
    <div className="flex flex-col h-screen bg-space-950 text-slate-200 font-sans selection:bg-cyan-500 selection:text-space-950 relative">
      
      {/* Reset Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-space-900 border border-red-900/50 rounded-lg shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
                <div className="flex items-center space-x-3 text-red-400 mb-4">
                    <AlertTriangle className="w-8 h-8" />
                    <h3 className="text-xl font-bold">Reset Universe?</h3>
                </div>
                <p className="text-slate-300 mb-6 leading-relaxed">
                    Are you sure you want to destroy the current universe and start over? <br/><br/>
                    <span className="text-red-400/80 text-sm">Warning: All discoveries, upgrades, and collected data will be lost forever.</span>
                </p>
                <div className="flex justify-end space-x-3">
                    <button 
                        onClick={() => setShowResetConfirm(false)}
                        className="px-4 py-2 rounded bg-space-800 hover:bg-space-700 text-slate-300 font-bold transition-colors flex items-center"
                    >
                        <X className="w-4 h-4 mr-2" />
                        Cancel
                    </button>
                    <button 
                        onClick={performReset}
                        className="px-4 py-2 rounded bg-red-900/80 hover:bg-red-800 text-red-100 font-bold transition-colors flex items-center"
                    >
                        <Check className="w-4 h-4 mr-2" />
                        Confirm Reset
                    </button>
                </div>
            </div>
        </div>
      )}

      <header className="flex items-center justify-between px-6 py-4 bg-space-900 border-b border-space-800 shadow-md z-10">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-indigo-600 rounded-full animate-pulse-slow">
             <Eye className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-widest uppercase text-indigo-300 hidden md:block">Celestia</h1>
        </div>

        <div className="flex space-x-4 md:space-x-8">
          <div className="flex items-center space-x-2" title="Starlight">
            <Sparkles className="w-5 h-5 text-starlight animate-twinkle" />
            <span className="text-lg font-mono font-bold text-starlight">{Math.floor(resources.starlight).toLocaleString()}</span>
            <span className="text-xs text-slate-500 uppercase hidden sm:inline">Lummens</span>
          </div>
          <div className="flex items-center space-x-2" title="Data">
            <Database className="w-5 h-5 text-data" />
            <span className="text-lg font-mono font-bold text-data">{Math.floor(resources.data).toLocaleString()}</span>
            <span className="text-xs text-slate-500 uppercase hidden sm:inline">Bytes</span>
          </div>
          <div className="flex items-center space-x-2" title="Focus">
            <Zap className="w-5 h-5 text-rose-400" />
            <div className="flex flex-col w-24 md:w-32">
                <div className="flex justify-between text-xs text-rose-300 mb-1">
                    <span>Focus</span>
                    <span>{Math.floor(resources.focus)}</span>
                </div>
                <div className="w-full h-2 bg-space-800 rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-rose-500 transition-all duration-500 ease-out"
                        style={{ width: `${(resources.focus / (MAX_FOCUS_BASE + (upgrades.find(u => u.id === 'focus_condenser')?.level || 0) * 50)) * 100}%` }}
                    />
                </div>
            </div>
          </div>
          <div className="flex items-center border-l border-space-800 pl-4 ml-4">
            <button 
                onClick={() => setShowResetConfirm(true)} 
                className="p-2 hover:bg-red-900/30 rounded text-slate-500 hover:text-red-400 transition-colors" 
                title="Reset Universe"
            >
                <RotateCcw className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        <aside className="w-80 bg-space-900 border-r border-space-800 flex flex-col overflow-hidden z-20 shadow-xl shrink-0">
          <div className="p-4 border-b border-space-800">
            <button 
              ref={gazeButtonRef}
              onMouseDown={() => setIsGazing(true)}
              onMouseUp={() => setIsGazing(false)}
              onMouseLeave={() => setIsGazing(false)}
              onTouchStart={() => setIsGazing(true)}
              onTouchEnd={() => setIsGazing(false)}
              className="relative w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-lg font-bold shadow-lg shadow-indigo-900/50 transition-all transform active:scale-[0.98] flex items-center justify-center space-x-2 mb-4 overflow-hidden group select-none"
            >
              <div className="absolute top-0 left-0 h-full bg-white/20 cooldown-bar w-full pointer-events-none origin-left" style={{ width: '100%' }}></div>
              <div className="relative z-10 flex items-center space-x-2">
                <Eye className={`w-5 h-5 ${isGazing ? 'animate-pulse' : ''}`} />
                <span>Gaze at the Void</span>
              </div>
              <div className="absolute bottom-0 right-2 text-[10px] opacity-50 font-mono">{getGazeCooldown().toFixed(0)}ms</div>
            </button>

            <button 
              onClick={handleScan}
              disabled={!canScan}
              className={`w-full py-3 rounded-lg font-bold flex items-center justify-center space-x-2 transition-all border border-cyan-900/50 ${
                  !canScan
                  ? 'bg-space-800 text-slate-600 cursor-not-allowed' 
                  : 'bg-cyan-950 hover:bg-cyan-900 text-cyan-400 shadow-lg shadow-cyan-900/20'
              }`}
            >
              {isScanning ? <Activity className="w-5 h-5 animate-spin" /> : <Scan className="w-5 h-5" />}
              <span>{isScanning ? 'Scanning...' : `Deep Scan`}</span>
            </button>
             <div className="flex justify-between text-[10px] text-slate-500 mt-1 px-1">
                <span>Cost: {focusCost} Focus, {lightCost} Light</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <h2 className="text-xs font-bold uppercase text-slate-500 tracking-widest mb-2">Equipment Upgrades</h2>
            {upgrades.map(u => {
                const cost = getUpgradeCost(u);
                const canAfford = resources.starlight >= cost;
                const isMaxed = u.level >= u.maxLevel;

                return (
                    <div key={u.id} className="bg-space-800/50 p-3 rounded border border-space-700 hover:border-space-600 transition-colors">
                        <div className="flex justify-between items-start mb-1">
                            <span className="font-bold text-sm text-slate-200">{u.name}</span>
                            <span className="text-xs text-indigo-400">Lvl {u.level}</span>
                        </div>
                        <p className="text-xs text-slate-400 mb-2 h-8">{u.description}</p>
                        <div className="flex justify-between items-center">
                             <span className="text-xs text-starlight font-mono">
                                {isMaxed ? 'MAX' : `${cost.toLocaleString()} L`}
                             </span>
                             <button
                                onClick={() => buyUpgrade(u.id)}
                                disabled={!canAfford || isMaxed}
                                className={`px-3 py-1 rounded text-xs font-bold uppercase transition-all ${
                                    isMaxed ? 'bg-slate-700 text-slate-500' :
                                    canAfford 
                                    ? 'bg-indigo-600 hover:bg-indigo-500 text-white' 
                                    : 'bg-space-700 text-slate-500 cursor-not-allowed'
                                }`}
                             >
                                {isMaxed ? 'Done' : 'Upgrade'}
                             </button>
                        </div>
                    </div>
                );
            })}
          </div>
        </aside>

        <section className="flex-1 relative bg-black overflow-hidden">
            <StarMap 
                stars={stars} 
                constellations={constellations}
                onSelectStar={setSelectedStar} 
                selectedStarId={selectedStar?.id || null} 
            />
            
            <div className="absolute top-4 left-4 pointer-events-none">
                 <div className="text-xs text-slate-400 uppercase tracking-widest mb-1">Known Universe</div>
                 <div className="text-4xl font-thin text-white">{stars.length} <span className="text-base font-normal text-slate-500">Bodies Discovered</span></div>
                 <div className="text-xl font-thin text-indigo-300 mt-1">{constellations.length} <span className="text-xs font-normal text-slate-500">Constellations Charted</span></div>
            </div>

            <div className="absolute bottom-0 left-0 w-full h-48 bg-gradient-to-t from-space-950 via-space-950/90 to-transparent pointer-events-none flex flex-col justify-end p-6">
                 <div className="space-y-1 overflow-hidden flex flex-col-reverse h-32 mask-linear-fade">
                    {logs.map(log => (
                        <div key={log.id} className={`text-sm animate-in fade-in slide-in-from-bottom-2 duration-300 flex items-center space-x-2 ${
                            log.type === 'discovery' ? 'text-cyan-300' : 
                            log.type === 'constellation' ? 'text-amber-300 font-bold' :
                            log.type === 'warning' ? 'text-red-400' :
                            log.type === 'upgrade' ? 'text-starlight' : 'text-slate-400'
                        }`}>
                            <span className="opacity-50 text-xs font-mono">[{new Date(log.timestamp).toLocaleTimeString([], {hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit'})}]</span>
                            <span>{log.message}</span>
                        </div>
                    ))}
                 </div>
            </div>
        </section>

        {selectedStar ? (
             <aside className="w-96 bg-space-900/95 backdrop-blur-md border-l border-space-800 p-6 flex flex-col z-20 shadow-2xl animate-in slide-in-from-right duration-300 absolute right-0 h-full md:static">
                <div className="flex justify-between items-start mb-6">
                     <div>
                        <div className="text-xs text-slate-500 uppercase tracking-widest mb-1">{selectedStar.type}</div>
                        <h2 className="text-3xl font-bold text-white leading-tight">{selectedStar.name}</h2>
                     </div>
                     <button onClick={() => setSelectedStar(null)} className="text-slate-500 hover:text-white">
                        <ChevronUp className="w-6 h-6 rotate-90" />
                     </button>
                </div>

                <div className="space-y-6 flex-1 overflow-y-auto pr-2">
                    <div className="w-full aspect-square rounded-full mx-auto relative shadow-2xl shadow-black/50 border border-white/10"
                         style={{ 
                             background: selectedStar.type === CelestialType.BLACK_HOLE 
                                ? `radial-gradient(circle at 50% 50%, #000 40%, ${selectedStar.color} 60%, transparent 70%)` 
                                : `radial-gradient(circle at 30% 30%, ${selectedStar.color}, #000)`,
                             boxShadow: `0 0 40px ${selectedStar.color}40`
                         }}
                    >
                        <div className="absolute inset-0 rounded-full opacity-50 mix-blend-screen bg-[url('https://www.transparenttextures.com/patterns/stardust.png')]"></div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-space-800 p-3 rounded">
                            <div className="text-xs text-slate-500">Distance</div>
                            <div className="text-lg font-mono text-cyan-300">{selectedStar.distanceLightYears.toLocaleString()} <span className="text-xs">ly</span></div>
                        </div>
                         <div className="bg-space-800 p-3 rounded">
                            <div className="text-xs text-slate-500">Temperature</div>
                            <div className="text-lg font-mono text-orange-300">{selectedStar.temperatureK ? `${selectedStar.temperatureK} K` : 'N/A'}</div>
                        </div>
                        {selectedStar.spectralClass && (
                             <div className="bg-space-800 p-3 rounded col-span-2">
                                <div className="text-xs text-slate-500">Spectral Class</div>
                                <div className="text-lg font-mono text-white">{selectedStar.spectralClass}</div>
                            </div>
                        )}
                    </div>

                    <div className="prose prose-invert prose-sm">
                        <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">{selectedStar.description}</p>
                    </div>

                    <div className="mt-auto pt-6">
                        <button 
                            onClick={handleAnalyze}
                            disabled={selectedStar.analyzed || resources.data < 50 || isAnalyzing}
                            className={`w-full py-3 rounded border flex items-center justify-center space-x-2 transition-all ${
                                selectedStar.analyzed 
                                ? 'border-green-900/50 bg-green-900/20 text-green-400 cursor-default'
                                : resources.data < 50 
                                    ? 'border-space-700 bg-space-800 text-slate-500 cursor-not-allowed'
                                    : 'border-indigo-500/50 bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600 hover:text-white'
                            }`}
                        >
                            {isAnalyzing ? <Activity className="w-4 h-4 animate-spin"/> : selectedStar.analyzed ? <Database className="w-4 h-4" /> : <Microscope className="w-4 h-4" />}
                            <span>
                                {isAnalyzing ? 'Processing...' : selectedStar.analyzed ? 'Analysis Complete' : 'Deep Analysis (50 Data)'}
                            </span>
                        </button>
                    </div>
                </div>
             </aside>
        ) : (
            <div className="w-0 transition-all duration-300"></div>
        )}
      </main>
    </div>
  );
};

export default App;