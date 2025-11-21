import { GoogleGenAI, Type, Schema } from "@google/genai";
import { CelestialBody, CelestialType } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Model selection based on task complexity
const CREATIVE_MODEL = 'gemini-2.5-flash';

export const generateCelestialDiscovery = async (
  coordinates: { x: number, y: number },
  existingCount: number
): Promise<Partial<CelestialBody>> => {
  
  const systemInstruction = `
    You are an astronomical simulation engine. 
    Your task is to generate a scientifically plausible but fictional celestial body discovered by a telescope.
    The universe is vast, dark, and mysterious. 
    The description should be evocative, mentioning visual characteristics (colors, swirls, brightness) and scientific hints.
    
    If the 'existingCount' is low, generate mostly Stars. 
    As 'existingCount' increases, introduce Nebulae, Black Holes, and Anomalies more frequently.
  `;

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: "A scientific or mythological name (e.g., 'Alpha Ceti', 'The Veiled Eye')" },
      type: { type: Type.STRING, enum: Object.values(CelestialType) },
      description: { type: Type.STRING, description: "A 2-sentence visual and scientific description." },
      distanceLightYears: { type: Type.NUMBER, description: "Distance from observer in light years." },
      color: { type: Type.STRING, description: "Hex color code representing the object's primary visual hue." },
      temperatureK: { type: Type.NUMBER, description: "Surface temperature in Kelvin (if applicable)." },
      spectralClass: { type: Type.STRING, description: "Spectral classification (e.g., O, B, A, F, G, K, M) if it is a star." },
    },
    required: ["name", "type", "description", "distanceLightYears", "color"],
  };

  try {
    const response = await ai.models.generateContent({
      model: CREATIVE_MODEL,
      contents: `Generate a celestial body. We have discovered ${existingCount} objects so far. Coordinates: Sector ${coordinates.x}:${coordinates.y}.`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 1.1, // High creativity
      },
    });

    if (response.text) {
        return JSON.parse(response.text);
    }
    throw new Error("No text returned from Gemini");
  } catch (error) {
    console.error("Gemini Discovery Error:", error);
    // Fallback for offline/error modes
    return {
      name: `Unknown Signal ${Math.floor(Math.random() * 1000)}`,
      type: CelestialType.STAR,
      description: "Static interference prevents clear identification. A faint glimmer in the void.",
      distanceLightYears: Math.floor(Math.random() * 5000),
      color: "#ffffff",
    };
  }
};

export const analyzeCelestialBody = async (body: CelestialBody): Promise<string> => {
    const systemInstruction = `
        You are the ship's computer analyzing detailed telemetry from a celestial object.
        Provide a short, dense paragraph of scientific analysis. 
        Mention composition, orbital mechanics, potential for life, or strange energetic readings.
    `;

    try {
        const response = await ai.models.generateContent({
            model: CREATIVE_MODEL,
            contents: `Analyze this object: ${JSON.stringify(body)}`,
            config: {
                systemInstruction,
                maxOutputTokens: 150,
            }
        });
        return response.text || "Analysis inconclusive.";
    } catch (error) {
        console.error("Analysis Error", error);
        return "Data corrupted. Unable to complete analysis.";
    }
}
