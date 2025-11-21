import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { CelestialBody, CelestialType } from '../types';

interface StarMapProps {
  stars: CelestialBody[];
  onSelectStar: (star: CelestialBody) => void;
  selectedStarId: string | null;
}

const StarMap: React.FC<StarMapProps> = ({ stars, onSelectStar, selectedStarId }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

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

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clear previous renders

    const { width, height } = dimensions;

    // Create a zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 10])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom);

    // Define Filters & Gradients
    const defs = svg.append("defs");
    
    // Star Glow
    const starFilter = defs.append("filter").attr("id", "star-glow");
    starFilter.append("feGaussianBlur").attr("stdDeviation", "2").attr("result", "coloredBlur");
    const starMerge = starFilter.append("feMerge");
    starMerge.append("feMergeNode").attr("in", "coloredBlur");
    starMerge.append("feMergeNode").attr("in", "SourceGraphic");

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
    accretionGradient.append("stop").attr("offset", "85%").attr("stop-color", "#f59e0b").attr("stop-opacity", 0.8); // Inner hot ring
    accretionGradient.append("stop").attr("offset", "100%").attr("stop-color", "#7c3aed").attr("stop-opacity", 0); // Outer fading edge

    // Group for content to allow zooming
    const g = svg.append("g");

    // Define coordinate scales
    const xScale = d3.scaleLinear().domain([0, 1000]).range([0, width * 2]);
    const yScale = d3.scaleLinear().domain([0, 1000]).range([height * 2, 0]);

    // --- Constellation Logic ---
    const MAX_CONNECTION_DISTANCE = 180;
    const links: { x1: number, y1: number, x2: number, y2: number, opacity: number }[] = [];

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
        links.push({
          x1: star.coordinates.x,
          y1: star.coordinates.y,
          x2: n.s.coordinates.x,
          y2: n.s.coordinates.y,
          opacity: 1 - (n.dist / MAX_CONNECTION_DISTANCE)
        });
      });
    });

    // Draw Constellation Lines
    g.selectAll("line.constellation")
      .data(links)
      .enter()
      .append("line")
      .classed("constellation", true)
      .attr("x1", d => xScale(d.x1))
      .attr("y1", d => yScale(d.y1))
      .attr("x2", d => xScale(d.x2))
      .attr("y2", d => yScale(d.y2))
      .attr("stroke", "#cbd5e1") 
      .attr("stroke-width", 0.5)
      .attr("opacity", d => d.opacity * 0.15) 
      .style("pointer-events", "none");

    // --- Draw Bodies ---
    // We use groups to handle the positioning of mixed shapes
    const bodyGroups = g.selectAll(".celestial-body")
      .data(stars)
      .enter()
      .append("g")
      .attr("class", "celestial-body")
      .attr("transform", d => `translate(${xScale(d.coordinates.x)}, ${yScale(d.coordinates.y)})`)
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        event.stopPropagation();
        onSelectStar(d);
      });

    // 1. STARS
    const starsOnly = bodyGroups.filter(d => d.type === CelestialType.STAR || !d.type);
    starsOnly.append("circle")
      .attr("r", 3)
      .attr("fill", d => d.color)
      .attr("filter", "url(#star-glow)");

    // 2. NEBULAE
    const nebulae = bodyGroups.filter(d => d.type === CelestialType.NEBULA);
    // Main diffuse cloud
    nebulae.append("circle")
      .attr("r", 15)
      .attr("fill", d => d.color)
      .attr("filter", "url(#nebula-blur)")
      .attr("opacity", 0.5);
    // Brighter core
    nebulae.append("circle")
      .attr("r", 10)
      .attr("fill", "#fff")
      .attr("filter", "url(#nebula-blur)")
      .attr("opacity", 0.2);
    
    // 3. GALAXIES
    const galaxies = bodyGroups.filter(d => d.type === CelestialType.GALAXY);
    // Spiral/Disk representation
    galaxies.append("ellipse")
      .attr("rx", 12)
      .attr("ry", 4)
      .attr("fill", d => d.color)
      .attr("transform", d => {
          const angle = (d.coordinates.x + d.coordinates.y) % 180;
          return `rotate(${angle})`;
      })
      .attr("filter", "url(#galaxy-glow)")
      .attr("opacity", 0.8);
    // Central bulge
    galaxies.append("circle")
      .attr("r", 3)
      .attr("fill", "#fff")
      .attr("filter", "url(#star-glow)");

    // 4. BLACK HOLES
    const blackHoles = bodyGroups.filter(d => d.type === CelestialType.BLACK_HOLE);
    
    // Accretion Disk (Gradient)
    blackHoles.append("circle")
      .attr("r", 12)
      .attr("fill", "url(#accretion-gradient)")
      .attr("opacity", 0.9);

    // Photon Ring (Thin bright ring)
    blackHoles.append("circle")
      .attr("r", 5)
      .attr("fill", "none")
      .attr("stroke", "#fff")
      .attr("stroke-width", 0.5)
      .attr("opacity", 0.6);

    // Event Horizon (Pure Black Void)
    blackHoles.append("circle")
      .attr("r", 4.5)
      .attr("fill", "#000000")
      .attr("stroke", "#222")
      .attr("stroke-width", 0.2);

    // 5. ANOMALIES
    const anomalies = bodyGroups.filter(d => d.type === CelestialType.ANOMALY);
    anomalies.append("path")
      .attr("d", d3.symbol().type(d3.symbolDiamond).size(150))
      .attr("fill", d => d.color)
      .attr("stroke", "#fff")
      .attr("stroke-width", 1)
      .classed("animate-pulse", true);

    // Selection Highlight
    bodyGroups.filter(d => d.id === selectedStarId)
      .append("circle")
      .attr("r", d => {
          if (d.type === CelestialType.NEBULA) return 20;
          if (d.type === CelestialType.GALAXY) return 16;
          if (d.type === CelestialType.BLACK_HOLE) return 14;
          return 8;
      })
      .attr("fill", "none")
      .attr("stroke", "#fff")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3 2")
      .attr("class", "selection-ring");

    // Hover Interactions
    bodyGroups
      .on("mouseenter", function(e, d) {
         const sel = d3.select(this);
         if (d.type === CelestialType.GALAXY) {
             sel.select("ellipse").attr("opacity", 1).attr("rx", 15);
         } else if (d.type === CelestialType.NEBULA) {
             sel.select("circle").attr("opacity", 0.8);
         } else if (d.type === CelestialType.BLACK_HOLE) {
             sel.select("circle").attr("stroke", "#fff").attr("stroke-width", 1);
         } else {
             sel.select("circle").attr("r", 5);
         }
      })
      .on("mouseleave", function(e, d) {
         const sel = d3.select(this);
         if (d.type === CelestialType.GALAXY) {
             sel.select("ellipse").attr("opacity", 0.8).attr("rx", 12);
         } else if (d.type === CelestialType.NEBULA) {
             sel.select("circle").attr("opacity", 0.5);
         } else if (d.type === CelestialType.BLACK_HOLE) {
             sel.select("circle").attr("stroke", "#222").attr("stroke-width", 0.2);
         } else {
             sel.select("circle").attr("r", 3);
         }
      });

  }, [stars, dimensions, selectedStarId, onSelectStar]);

  return (
    <div ref={containerRef} className="w-full h-full bg-space-950 overflow-hidden relative rounded-lg border border-space-800">
      <svg ref={svgRef} width={dimensions.width} height={dimensions.height} className="absolute top-0 left-0 w-full h-full" />
      
      {/* Lens Effects Layer */}
      <div className="absolute inset-0 pointer-events-none z-10 rounded-lg overflow-hidden">
        {/* Edge Distortion (Blur) */}
        <div 
            className="absolute inset-0 backdrop-blur-[2px]"
            style={{
                maskImage: 'radial-gradient(circle at center, transparent 60%, black 100%)',
                WebkitMaskImage: 'radial-gradient(circle at center, transparent 60%, black 100%)'
            }}
        />
        
        {/* Vignette */}
        <div 
            className="absolute inset-0"
            style={{
                background: 'radial-gradient(circle at center, transparent 50%, rgba(5, 10, 30, 0.3) 80%, rgba(0, 0, 0, 0.8) 100%)'
            }}
        />

        {/* Chromatic Aberration / Discoloration */}
        <div 
            className="absolute inset-0 opacity-40 mix-blend-color-dodge"
            style={{
                background: 'radial-gradient(circle at center, transparent 65%, rgba(255, 0, 128, 0.15) 85%, rgba(0, 255, 255, 0.15) 100%)'
            }}
        />
        
        {/* Subtle Texture/Dust */}
        <div 
             className="absolute inset-0 opacity-[0.03] mix-blend-overlay bg-repeat"
             style={{ 
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
             }} 
        />
      </div>

      <div className="absolute bottom-4 right-4 text-xs text-slate-500 pointer-events-none z-20">
        Map Sector 0-1000
      </div>
    </div>
  );
};

export default StarMap;