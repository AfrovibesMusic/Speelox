import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, serverTimestamp, collection, query, orderBy, getDocs, getDocFromServer, deleteDoc } from 'firebase/firestore';
import { GeneratedPost } from '../types';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

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
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
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
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Login failed", error);
    throw error;
  }
}

export async function loginWithEmail(email: string, pass: string) {
  try {
    const result = await signInWithEmailAndPassword(auth, email, pass);
    return result.user;
  } catch (error) {
    console.error("Email login failed", error);
    throw error;
  }
}

export async function signupWithEmail(email: string, pass: string) {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, pass);
    return result.user;
  } catch (error) {
    console.error("Email signup failed", error);
    throw error;
  }
}

export async function logout() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Logout failed", error);
    throw error;
  }
}

export async function savePostToDatabase(userId: string, post: GeneratedPost) {
  const path = `users/${userId}/posts`;
  try {
    // Separate id from data if it exists
    const { id, ...postData } = post;
    const postId = id || Math.random().toString(36).substring(7);
    const postRef = doc(db, 'users', userId, 'posts', postId);
    
    await setDoc(postRef, {
      ...postData,
      savedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function getSavedPosts(userId: string): Promise<GeneratedPost[]> {
  const path = `users/${userId}/posts`;
  try {
    const q = query(collection(db, 'users', userId, 'posts'), orderBy("savedAt", "desc"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as GeneratedPost));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return [];
  }
}

export async function deleteSavedPost(userId: string, postId: string) {
  const path = `users/${userId}/posts/${postId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'posts', postId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveDiscoveredItem(userId: string, item: any) {
  const path = `users/${userId}/discovered`;
  try {
    // Generate a consistent ID based on the link to avoid duplicates
    // But since the user might want a history of when they looked at it, 
    // maybe just a random ID is better, or a hash of the link.
    // Let's use a hash of the link or just the link as the ID if we want to update.
    // The user said "history of everything", so maybe unique is better.
    const itemId = Math.random().toString(36).substring(7);
    const itemRef = doc(db, 'users', userId, 'discovered', itemId);
    
    await setDoc(itemRef, {
      ...item,
      discoveredAt: serverTimestamp()
    });
    return itemId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function getDiscoveredHistory(userId: string) {
  const path = `users/${userId}/discovered`;
  try {
    const q = query(collection(db, 'users', userId, 'discovered'), orderBy("discoveredAt", "desc"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return [];
  }
}

export async function saveUserSettings(userId: string, settings: { 
  username?: string, 
  logoUrl: string, 
  defaultPrimaryColor: string, 
  defaultTemplateId: string,
  captionColor?: string,
  descriptionColor?: string
}) {
  const path = `settings/${userId}`;
  console.log(`[Firebase] Saving settings to ${path}`, settings);
  console.log(`[Firebase] Current Auth User: ${auth.currentUser?.uid}`);
  try {
    await setDoc(doc(db, 'settings', userId), {
      ...settings,
      updatedAt: serverTimestamp()
    }, { merge: true });
    console.log(`[Firebase] Settings saved successfully`);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function getUserSettings(userId: string) {
  const path = `settings/${userId}`;
  try {
    const docRef = doc(db, 'settings', userId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data();
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const path = `usernames/${username}`;
  try {
    const docRef = doc(db, 'usernames', username.toLowerCase());
    const docSnap = await getDocFromServer(docRef);
    return !docSnap.exists();
  } catch (error) {
    // If it's a permission error, it might be because of rule restrictions or just not existing
    return true; 
  }
}

export async function claimUsername(userId: string, username: string) {
  const path = `usernames/${username}`;
  try {
    const lowerUsername = username.toLowerCase();
    await setDoc(doc(db, 'usernames', lowerUsername), {
      userId,
      registeredAt: serverTimestamp()
    });
    
    // Also update settings
    await saveUserSettings(userId, { 
      username: lowerUsername,
      logoUrl: "",
      defaultPrimaryColor: "#4f46e5",
      defaultTemplateId: "minimal-clean" 
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();
