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
    let userData: any = { preferences: {} };
    if (!!import.meta.env.VITE_FIREBASE_API_KEY) {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) userData = userDoc.data();
    }

    // 2. Fetch User's exported skills
    let skills: any[] = [];
    if (!!import.meta.env.VITE_FIREBASE_API_KEY) {
      const skillsSnapshot = await getDocs(collection(db, 'skills'));
      skills = skillsSnapshot.docs.map(d => d.data());
    }

    // 3. Fetch Semantic Graph
    let graph: any = { nodes: {}, edges: [] };
    if (!!import.meta.env.VITE_FIREBASE_API_KEY) {
      const graphDoc = await getDoc(doc(db, 'life_graphs', userId));
      if (graphDoc.exists()) graph = graphDoc.data();
    }

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
