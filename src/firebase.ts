import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export const signInWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    prompt: 'select_account'
  });
  
  try {
    await signInWithPopup(auth, provider);
  } catch (error: any) {
    if (error.code === 'auth/popup-closed-by-user') {
      console.log("O login foi cancelado pelo usuário.");
    } else {
      console.error("Error signing in with Google", error);
      alert("Erro ao fazer login. Por favor, tente novamente.");
    }
  }
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out", error);
  }
};
