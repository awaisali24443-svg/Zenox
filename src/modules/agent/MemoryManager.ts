import { db } from '../db/firebase';
import { doc, getDoc, setDoc, updateDoc, collection, addDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';

export interface UserContext {
  userId: string;
  preferences: Record<string, any>;
  lastDeployment?: string;
}

export interface MemoryEntry {
  id?: string;
  userId: string;
  content: string;
  timestamp: number;
}

export class MemoryManager {
  private static instance: MemoryManager;

  private constructor() {}

  public static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager();
    }
    return MemoryManager.instance;
  }

  /**
   * Fetches the long-term context of a user
   */
  public async getUserContext(userId: string): Promise<UserContext | null> {
    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        return userSnap.data() as UserContext;
      }
      return null;
    } catch (e) {
      console.error('[MemoryManager] Error fetching user context:', e);
      return null;
    }
  }

  /**
   * Updates or creates the user's long-term context
   */
  public async saveUserContext(userId: string, data: Partial<UserContext>): Promise<void> {
    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        await updateDoc(userRef, data);
      } else {
        await setDoc(userRef, { userId, preferences: {}, ...data });
      }
    } catch (e) {
      console.error('[MemoryManager] Error saving user context:', e);
    }
  }

  /**
   * Adds an item to the short-term working memory (recent events/past tasks)
   */
  public async addMemoryEntry(userId: string, content: string): Promise<void> {
    try {
      const memoryRef = collection(db, 'users', userId, 'memories');
      await addDoc(memoryRef, {
        userId,
        content,
        timestamp: Date.now()
      });
    } catch (e) {
      console.error('[MemoryManager] Error adding memory entry:', e);
    }
  }

  /**
   * Retrieves the latest memory context
   */
  public async getRecentMemories(userId: string, count: number = 5): Promise<MemoryEntry[]> {
    try {
      const memoryRef = collection(db, 'users', userId, 'memories');
      const q = query(memoryRef, orderBy('timestamp', 'desc'), limit(count));
      const snapshot = await getDocs(q);

      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MemoryEntry));
    } catch (e) {
      console.error('[MemoryManager] Error fetching recent memories:', e);
      return [];
    }
  }
}
