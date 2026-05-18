import { db } from '../db/firebase';
import { collection, query, getDocs, doc, getDoc } from 'firebase/firestore';

export interface ZenoxBlueprint {
  version: string;
  skills: any[];
  memory: any[];
  graph: any;
  customInstructions: string;
}

export class BlueprintManager {
  private static instance: BlueprintManager;
  
  private constructor() {}

  public static getInstance(): BlueprintManager {
    if (!BlueprintManager.instance) {
      BlueprintManager.instance = new BlueprintManager();
    }
    return BlueprintManager.instance;
  }

  public async exportBlueprint(userId: string): Promise<string> {
    console.log(`[BlueprintManager] Compiling blueprint for ${userId}`);
    
    // 1. Fetch User details (custom instructions/preferences)
    const userDoc = await getDoc(doc(db, 'users', userId));
    const userData = userDoc.exists() ? userDoc.data() : { preferences: {} };

    // 2. Fetch User's exported skills
    const skillsSnapshot = await getDocs(collection(db, 'skills'));
    const skills = skillsSnapshot.docs.map(d => d.data());

    // 3. Fetch Semantic Graph
    const graphDoc = await getDoc(doc(db, 'life_graphs', userId));
    const graph = graphDoc.exists() ? graphDoc.data() : { nodes: {}, edges: [] };

    // 4. Combine into serialized config
    const blueprint: ZenoxBlueprint = {
      version: "1.0",
      skills: skills.filter(s => s.status === 'active'), // only active, proven skills
      memory: [], // Explicitly stripping recent memory to just keep semantic graph to prevent sensitive info leak
      graph: graph, 
      customInstructions: userData.preferences?.customInstructions || ''
    };

    return JSON.stringify(blueprint, null, 2);
  }
}
