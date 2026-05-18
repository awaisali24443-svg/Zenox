import { db } from '../db/firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { LLMManager } from './LLMManager';

export interface GraphNode {
  id: string; // e.g. "Startup_A", "Awais", "Company_B"
  type: string; // e.g. "Person", "Company", "Concept", "Fact"
  properties: Record<string, any>;
}

export interface GraphEdge {
  sourceId: string;
  targetId: string;
  relation: string; // e.g. "owns", "competes_with", "interested_in"
}

export interface SemanticGraph {
  nodes: Record<string, GraphNode>;
  edges: GraphEdge[];
}

export class LifeGraph {
  private static instance: LifeGraph;
  private llm: LLMManager;

  private constructor() {
    this.llm = LLMManager.getInstance();
  }

  public static getInstance(): LifeGraph {
    if (!LifeGraph.instance) {
      LifeGraph.instance = new LifeGraph();
    }
    return LifeGraph.instance;
  }

  /**
   * Retrieves the semantic life graph for a user.
   */
  public async getGraph(userId: string): Promise<SemanticGraph> {
    try {
      const graphRef = doc(db, 'life_graphs', userId);
      const graphDoc = await getDoc(graphRef);
      if (graphDoc.exists()) {
        return graphDoc.data() as SemanticGraph;
      }
      return { nodes: {}, edges: [] };
    } catch (e) {
      console.error("[LifeGraph] Error fetching graph:", e);
      return { nodes: {}, edges: [] };
    }
  }

  /**
   * Translates a natural language fact into a deterministic graph update via LLM.
   */
  public async extractAndStoreFact(userId: string, factString: string): Promise<void> {
    console.log(`[LifeGraph] Extracting semantic facts from: "${factString}"`);
    
    // In production, we use structured output (Function Calling) from Gemini 
    // to strictly enforce the JSON return structure.
    const prompt = `
      Extract deterministic knowledge nodes and relationship edges from the following fact.
      Return ONLY valid JSON matching this schema:
      {
        "nodes": [{ "id": "Name_Or_Entity", "type": "Thing/Person/Company", "properties": {} }],
        "edges": [{ "sourceId": "Entity_A", "targetId": "Entity_B", "relation": "relationship_name" }]
      }
      Fact: "${factString}"
    `;

    try {
      // We leverage the LLM to do the semantic mapping (Phase 2 constraint)
      const completion = await this.llm.generateCode(prompt, 'json'); // generateCode essentially works for JSON extraction
      let parsedExtraction;
      try {
        parsedExtraction = JSON.parse(completion.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim());
      } catch (err) {
        console.warn("[LifeGraph] Failed to parse LLM graph output", err);
        return;
      }

      const existingGraph = await this.getGraph(userId);
      const updatedGraph = { ...existingGraph };

      if (parsedExtraction.nodes) {
        parsedExtraction.nodes.forEach((n: GraphNode) => {
          updatedGraph.nodes[n.id] = n;
        });
      }
      if (parsedExtraction.edges) {
        updatedGraph.edges.push(...parsedExtraction.edges);
      }

      await setDoc(doc(db, 'life_graphs', userId), updatedGraph);
      console.log(`[LifeGraph] Semantic graph updated successfully for ${userId}`);

    } catch (e) {
      console.error("[LifeGraph] Extraction failure:", e);
    }
  }
}
