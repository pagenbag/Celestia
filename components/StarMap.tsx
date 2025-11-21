import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { CelestialBody, CelestialType, Constellation } from '../types';
import { Maximize, LocateFixed } from 'lucide-react';

interface StarMapProps {
  stars: CelestialBody[];
  constellations: Constellation[];
  onSelectStar: (star: CelestialBody) => void;
  selectedStarId: string | null;
}

const StarMap: React.FC<StarMapProps> = React.memo(({ stars, constellations, onSelectStar, selectedStarId }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  
  // Track the previous star count to detect new discoveries
  const prevStarCountRef = useRef(stars.length);

  // Update dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', updateDimensions);
    updateDimensions();
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Initialize SVG, Defs, and Zoom Behavior
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    
    if (svg.select("g.zoom-layer").empty()) {
        // Define Filters & Gradients
        const defs = svg.append("defs");
        
        // Star Glow
        const starFilter = defs.append("filter").attr("id", "star-glow");
        starFilter.append("feGaussianBlur").attr("stdDeviation", "2").attr("result", "coloredBlur");
        const starMerge = starFilter.append("feMerge");
        starMerge.append("feMergeNode").attr("in", "coloredBlur");
        starMerge.append("feMergeNode").attr("in", "SourceGraphic");

        // Constellation Line Glow (Enhanced)
        const lineFilter = defs.append("filter").attr("id", "line-glow");
        lineFilter.append("feGaussianBlur").attr("stdDeviation", "2").attr("result", "blur");
        const lineMerge = lineFilter.append("feMerge");
        lineMerge.append("feMergeNode").attr("in", "blur");
        lineMerge.append("feMergeNode").attr("in", "SourceGraphic");

        // Nebula Blur (Strong/Diffuse)
        const nebulaFilter = defs.append("filter").attr("id", "nebula-blur");
        nebulaFilter.append("feGaussianBlur").attr("stdDeviation", "8").attr("result", "coloredBlur");
        
        // Galaxy Glow
        const galaxyFilter = defs.append("filter").attr("id", "galaxy-glow");
        galaxyFilter.append("feGaussianBlur").attr("stdDeviation", "3").attr("result", "coloredBlur");
        const galaxyMerge = galaxyFilter.append("feMerge");
        galaxyMerge.append("feMergeNode").attr("in", "coloredBlur");
        galaxyMerge.append("feMergeNode").attr("in", "SourceGraphic");

        // Black Hole Accretion Gradient
        const accretionGradient = defs.append("radialGradient")
        .attr("id", "accretion-gradient")
        .attr("cx", "50%")
        .attr("cy", "50%")
        .attr("r", "50%");
        
        accretionGradient.append("stop").attr("offset", "70%").attr("stop-color", "#000000").attr("stop-opacity", 0);
        accretionGradient.append("stop").attr("offset", "85%").attr("stop-color", "#f59e0b").attr("stop-opacity", 0.8); 
        accretionGradient.append("stop").attr("offset", "100%").attr("stop-color", "#7c3aed").attr("stop-opacity", 0); 

        // Create the zoom layer group
        gRef.current = svg.append("g").attr("class", "zoom-layer");
    }

    // Initialize Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.05, 50]) 
      .on("zoom", (event) => {
        if (gRef.current) {
            gRef.current.attr("transform", event.transform);
        }
      });

    zoomRef.current = zoom;
    svg.call(zoom);
  }, [dimensions]);

  // Render Stars, Links, and Constellation Labels
  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;
    const { width, height } = dimensions;

    // Scales
    const xScale = d3.scaleLinear().domain([0, 1000]).range([0, width * 2]);
    const yScale = d3.scaleLinear().domain([0, 1000]).range([height * 2, 0]);

    // Map star ID to Constellation ID for quick lookup
    const starToConstellation = new Map<string, string>();
    const constellationData = new Map<string, { xSum: number, ySum: number, count: number, name: string }>();

    constellations.forEach(c => {
        c.starIds.forEach(sid => starToConstellation.set(sid, c.id));
        constellationData.set(c.id, { xSum: 0, ySum: 0, count: 0, name: c.name });
    });

    // Calculate centroids for labels
    stars.forEach(s => {
        const cId = starToConstellation.get(s.id);
        if (cId) {
            const data = constellationData.get(cId);
            if (data) {
                data.xSum += s.coordinates.x;
                data.ySum += s.coordinates.y;
                data.count++;
            }
        }
    });


    // Calculate Links
    const MAX_CONNECTION_DISTANCE = 180;
    const links: { id: string, x1: number, y1: number, x2: number, y2: number, opacity: number, isCharted: boolean }[] = [];

    stars.forEach((star) => {
        const neighbors = stars
        .filter(s => s.id !== star.id)
        .map(s => ({
            s,
            dist: Math.hypot(s.coordinates.x - star.coordinates.x, s.coordinates.y - star.coordinates.y)
        }))
        .filter(n => n.dist < MAX_CONNECTION_DISTANCE)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 2); 

        neighbors.forEach(n => {
            const linkId = [star.id, n.s.id].sort().join('-');
            if (star.id < n.s.id) {
                 // Check if both are in the SAME constellation
                 const c1 = starToConstellation.get(star.id);
                 const c2 = starToConstellation.get(n.s.id);
                 const isCharted = !!c1 && !!c2 && c1 === c2;

                 links.push({
                    id: linkId,
                    x1: star.coordinates.x,
                    y1: star.coordinates.y,
                    x2: n.s.coordinates.x,
                    y2: n.s.coordinates.y,
                    opacity: 1 - (n.dist / MAX_CONNECTION_DISTANCE),
                    isCharted
                });
            }
        });
    });

    const g = gRef.current;

    // --- JOIN LINKS ---
    const linkSelection = g.selectAll("line.constellation-line")
        .data(links, (d: any) => d.id);

    linkSelection.enter()
        .append("line")
        .attr("class", "constellation-line")
        .attr("stroke-width", 0.5)
        .style("pointer-events", "none")
        .attr("opacity", 0)
        .merge(linkSelection as any) // Update
        .classed("charted", (d: any) => d.isCharted) // Apply class for CSS animation
        .transition().duration(500)
        .attr("x1", d => xScale(d.x1))
        .attr("y1", d => yScale(d.y1))
        .attr("x2", d => xScale(d.x2))
        .attr("y2", d => yScale(d.y2))
        .attr("stroke", d => d.isCharted ? "#fbbf24" : "#cbd5e1") 
        .attr("stroke-width", d => d.isCharted ? 1.5 : 0.5)
        .attr("opacity", d => d.isCharted ? 0.8 : d.opacity * 0.15)
        .attr("filter", d => d.isCharted ? "url(#line-glow)" : "none");

    linkSelection.exit().remove();


    // --- JOIN BODIES ---
    const bodySelection = g.selectAll("g.celestial-body")
        .data(stars, (d: any) => d.id);

    const bodyEnter = bodySelection.enter()
        .append("g")
        .attr("class", "celestial-body")
        .style("cursor", "pointer")
        .attr("transform", d => `translate(${xScale(d.coordinates.x)}, ${yScale(d.coordinates.y)})`) // Initial pos
        .on("click", (event, d) => {
            event.stopPropagation();
            onSelectStar(d);
        });
    
    // ENTER: Draw specific shapes based on type
    bodyEnter.filter(d => d.type === CelestialType.STAR || !d.type)
        .append("circle")
        .attr("r", 3)
        .attr("fill", d => d.color)
        .attr("filter", "url(#star-glow)");

    const nebulaeEnter = bodyEnter.filter(d => d.type === CelestialType.NEBULA);
    nebulaeEnter.append("circle")
        .attr("r", 15)
        .attr("fill", d => d.color)
        .attr("filter", "url(#nebula-blur)")
        .attr("opacity", 0.5);
    nebulaeEnter.append("circle")
        .attr("r", 10)
        .attr("fill", "#fff")
        .attr("filter", "url(#nebula-blur)")
        .attr("opacity", 0.2);

    const galaxyEnter = bodyEnter.filter(d => d.type === CelestialType.GALAXY);
    galaxyEnter.append("ellipse")
        .attr("rx", 12)
        .attr("ry", 4)
        .attr("fill", d => d.color)
        .attr("transform", d => {
            const angle = (d.coordinates.x + d.coordinates.y) % 180;
            return `rotate(${angle})`;
        })
        .attr("filter", "url(#galaxy-glow)")
        .attr("opacity", 0.8);
    galaxyEnter.append("circle")
        .attr("r", 3)
        .attr("fill", "#fff")
        .attr("filter", "url(#star-glow)");

    const bhEnter = bodyEnter.filter(d => d.type === CelestialType.BLACK_HOLE);
    bhEnter.append("circle")
        .attr("r", 12)
        .attr("fill", "url(#accretion-gradient)")
        .attr("opacity", 0.9);
    bhEnter.append("circle")
        .attr("r", 5)
        .attr("fill", "none")
        .attr("stroke", "#fff")
        .attr("stroke-width", 0.5)
        .attr("opacity", 0.6);
    bhEnter.append("circle")
        .attr("r", 4.5)
        .attr("fill", "#000000")
        .attr("stroke", "#222")
        .attr("stroke-width", 0.2);

    const anomalyEnter = bodyEnter.filter(d => d.type === CelestialType.ANOMALY);
    anomalyEnter.append("path")
        .attr("d", d3.symbol().type(d3.symbolDiamond).size(150))
        .attr("fill", d => d.color)
        .attr("stroke", "#fff")
        .attr("stroke-width", 1)
        .classed("animate-pulse", true);
    
    bodyEnter
        .on("mouseenter", function(e, d) {
            const sel = d3.select(this);
            if (d.type === CelestialType.GALAXY) {
                sel.select("ellipse").transition().duration(200).attr("opacity", 1).attr("rx", 15);
            } else if (d.type === CelestialType.NEBULA) {
                sel.select("circle").transition().duration(200).attr("opacity", 0.8);
            } else if (d.type === CelestialType.BLACK_HOLE) {
                sel.select("circle:nth-child(3)").transition().duration(200).attr("stroke", "#fff").attr("stroke-width", 1);
            } else {
                sel.select("circle").transition().duration(200).attr("r", 5);
            }
        })
        .on("mouseleave", function(e, d) {
            const sel = d3.select(this);
            if (d.type === CelestialType.GALAXY) {
                sel.select("ellipse").transition().duration(300).attr("opacity", 0.8).attr("rx", 12);
            } else if (d.type === CelestialType.NEBULA) {
                sel.select("circle").transition().duration(300).attr("opacity", 0.5);
            } else if (d.type === CelestialType.BLACK_HOLE) {
                sel.select("circle:nth-child(3)").transition().duration(300).attr("stroke", "#222").attr("stroke-width", 0.2);
            } else {
                sel.select("circle").transition().duration(300).attr("r", 3);
            }
        });


    bodySelection.merge(bodyEnter as any)
        .attr("transform", d => `translate(${xScale(d.coordinates.x)}, ${yScale(d.coordinates.y)})`);

    bodySelection.exit().remove();

    // --- CONSTELLATION LABELS ---
    const labelsData = Array.from(constellationData.entries()).map(([id, data]) => ({
        id,
        x: data.xSum / data.count,
        y: data.ySum / data.count,
        name: data.name
    }));

    const labelSelection = g.selectAll("text.constellation-label")
        .data(labelsData, (d: any) => d.id);

    labelSelection.enter()
        .append("text")
        .attr("class", "constellation-label")
        .attr("text-anchor", "middle")
        .attr("fill", "#fcd34d")
        .attr("font-size", "10px")
        .attr("font-family", "serif")
        .attr("letter-spacing", "2px")
        .style("text-transform", "uppercase")
        .style("pointer-events", "none")
        .attr("opacity", 0)
        .text(d => d.name)
        .merge(labelSelection as any)
        .attr("x", d => xScale(d.x))
        .attr("y", d => yScale(d.y) + 20) // Offset slightly below center
        .transition().duration(1000).attr("opacity", 0.7);

    labelSelection.exit().remove();


    // --- SELECTION RING ---
    g.selectAll(".selection-ring").remove();
    if (selectedStarId) {
        const selected = stars.find(s => s.id === selectedStarId);
        if (selected) {
            const selGroup = g.selectAll(".celestial-body").filter((d: any) => d.id === selectedStarId);
            if (!selGroup.empty()) {
                selGroup.append("circle")
                    .attr("class", "selection-ring")
                    .attr("r", d => {
                        const datum = d as CelestialBody;
                        if (datum.type === CelestialType.NEBULA) return 20;
                        if (datum.type === CelestialType.GALAXY) return 16;
                        if (datum.type === CelestialType.BLACK_HOLE) return 14;
                        return 8;
                    })
                    .attr("fill", "none")
                    .attr("stroke", "#fff")
                    .attr("stroke-width", 1)
                    .attr("stroke-dasharray", "3 2")
                    .attr("opacity", 0)
                    .transition().duration(300).attr("opacity", 1);
            }
        }
    }

    // --- AUTO CENTER ON NEW DISCOVERY ---
    if (stars.length > prevStarCountRef.current) {
        const newStar = stars[stars.length - 1];
        if (svgRef.current && zoomRef.current) {
            const svg = d3.select(svgRef.current);
            const targetX = xScale(newStar.coordinates.x);
            const targetY = yScale(newStar.coordinates.y);
            svg.transition().duration(1200).ease(d3.easeCubicOut).call(
                zoomRef.current.transform,
                d3.zoomIdentity
                    .translate(width / 2, height / 2)
                    .scale(1.5)
                    .translate(-targetX, -targetY)
            );
        }
    }
    
    prevStarCountRef.current = stars.length;

  }, [stars, constellations, dimensions, selectedStarId, onSelectStar]); 

  // Zoom Helpers
  const zoomToFit = () => {
    if (!svgRef.current || !zoomRef.current || stars.length === 0) return;
    const svg = d3.select(svgRef.current);
    const { width, height } = dimensions;

    const xScale = d3.scaleLinear().domain([0, 1000]).range([0, width * 2]);
    const yScale = d3.scaleLinear().domain([0, 1000]).range([height * 2, 0]);
    
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    stars.forEach(s => {
        const x = xScale(s.coordinates.x);
        const y = yScale(s.coordinates.y);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    });

    const padding = 50;
    const boundsWidth = maxX - minX + padding * 2;
    const boundsHeight = maxY - minY + padding * 2;
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    if (boundsWidth <= 0 || boundsHeight <= 0) return;
    const scale = Math.min(0.8, Math.min(width / boundsWidth, height / boundsHeight));

    svg.transition().duration(1000).call(
        zoomRef.current.transform,
        d3.zoomIdentity
            .translate(width / 2, height / 2)
            .scale(scale)
            .translate(-midX, -midY)
    );
  };

  return (
    <div ref={containerRef} className="w-full h-full bg-space-950 overflow-hidden relative rounded-lg border border-space-800">
      <style>{`
        @keyframes constellation-pulse {
            0% { stroke-opacity: 0.5; stroke-width: 1px; }
            50% { stroke-opacity: 1; stroke-width: 2px; }
            100% { stroke-opacity: 0.5; stroke-width: 1px; }
        }
        .constellation-line.charted {
            animation: constellation-pulse 3s ease-in-out infinite;
        }
      `}</style>
      <svg ref={svgRef} width={dimensions.width} height={dimensions.height} className="absolute top-0 left-0 w-full h-full" />
      
      {/* Lens Effects Layer */}
      <div className="absolute inset-0 pointer-events-none z-10 rounded-lg overflow-hidden">
        <div 
            className="absolute inset-0 backdrop-blur-[2px]"
            style={{
                maskImage: 'radial-gradient(circle at center, transparent 60%, black 100%)',
                WebkitMaskImage: 'radial-gradient(circle at center, transparent 60%, black 100%)'
            }}
        />
        <div 
            className="absolute inset-0"
            style={{
                background: 'radial-gradient(circle at center, transparent 50%, rgba(5, 10, 30, 0.3) 80%, rgba(0, 0, 0, 0.8) 100%)'
            }}
        />
        <div 
            className="absolute inset-0 opacity-40 mix-blend-color-dodge"
            style={{
                background: 'radial-gradient(circle at center, transparent 65%, rgba(255, 0, 128, 0.15) 85%, rgba(0, 255, 255, 0.15) 100%)'
            }}
        />
        <div 
             className="absolute inset-0 opacity-[0.03] mix-blend-overlay bg-repeat"
             style={{ 
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
             }} 
        />
      </div>

      {/* Map Controls */}
      <div className="absolute top-4 right-4 z-30 flex flex-col space-y-2">
          <button 
            onClick={zoomToFit}
            className="p-2 bg-space-800/80 backdrop-blur text-slate-300 rounded hover:text-white hover:bg-space-700 border border-space-700 transition-colors"
            title="Zoom to Extents"
          >
            <Maximize className="w-5 h-5" />
          </button>
          {selectedStarId && (
              <button 
                onClick={() => {
                   const selected = stars.find(s => s.id === selectedStarId);
                   if (selected && svgRef.current && zoomRef.current) {
                        const xScale = d3.scaleLinear().domain([0, 1000]).range([0, dimensions.width * 2]);
                        const yScale = d3.scaleLinear().domain([0, 1000]).range([dimensions.height * 2, 0]);
                        const targetX = xScale(selected.coordinates.x);
                        const targetY = yScale(selected.coordinates.y);
                        d3.select(svgRef.current).transition().duration(750).call(
                            zoomRef.current.transform,
                            d3.zoomIdentity.translate(dimensions.width/2, dimensions.height/2).scale(2).translate(-targetX, -targetY)
                        );
                   }
                }}
                className="p-2 bg-space-800/80 backdrop-blur text-cyan-300 rounded hover:text-cyan-100 hover:bg-space-700 border border-space-700 transition-colors"
                title="Locate Selected"
              >
                <LocateFixed className="w-5 h-5" />
              </button>
          )}
      </div>

      <div className="absolute bottom-4 right-4 text-xs text-slate-500 pointer-events-none z-20">
        Map Sector 0-1000
      </div>
    </div>
  );
});

export default StarMap;